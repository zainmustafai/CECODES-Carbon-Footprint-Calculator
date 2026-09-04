import nodemailer from "nodemailer";
import { reportError } from "@/lib/observability/report-error";
import type { MailMessage, MailResult } from "@/lib/mail/transport";

// SMTP, for Mailpit in development and test and for any deployment that already has a relay.
//
// Same contract as the Resend transport: nothing throws, nothing about the message is logged.

const TIMEOUT_MS = 10_000;

/**
 * Bounds `work` by wall-clock time, and is the only bound on this transport a caller can rely on.
 *
 * The three timeouts below are nodemailer's, and each of them bounds ONE phase of ONE connection
 * attempt. That is not the same thing as bounding a send, for two reasons, both read off the
 * installed nodemailer@10.0.0 rather than assumed:
 *
 *  - Hostname resolution happens BEFORE any of them is armed. smtp-connection's connect() calls
 *    _resolveAndConnect() first, under `timeout: this.options.dnsTimeout || DNS_TIMEOUT` where
 *    `const DNS_TIMEOUT = 30 * 1000`; connectionTimeout is only armed later, by
 *    _setupConnectionHandlers(), which runs once _connectToHost() has actually created a socket.
 *    A host behind a black-holed resolver therefore stalls for 30 seconds before the 10 second
 *    connection budget has even started. `dnsTimeout` is now set explicitly below, which is what
 *    bounds that phase INSIDE nodemailer, but it is a fourth per-phase number, not a total.
 *  - connectionTimeout is per address, not per send. On a failed attempt _onConnectionError()
 *    shifts the next entry off _fallbackAddresses and calls _connectToHost() again, which arms a
 *    fresh connectionTimeout each time. A hostname with four A records that all drop SYNs costs
 *    four full connection budgets in sequence.
 *
 * So the per-phase values stay, because when one of them fires first it names the phase that
 * stalled, and this deadline sits over the whole thing. It is the same 10 seconds the Resend
 * transport gets from AbortSignal.timeout, and for the same reason: a Server Action holding a
 * user's spinner open is the failure being bounded, not the socket.
 */
async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        // Carries a `code` for the same reason nodemailer's errors do: it is the one field the
        // catch below is allowed to report, so without it a timed-out send would log identically
        // to every other failure. Deliberately not "ETIMEDOUT", which is nodemailer's own and
        // means a single phase gave up rather than the whole send running out of time.
        timer = setTimeout(
          () => reject(Object.assign(new Error("SMTP send exceeded its deadline"), { code: "EDEADLINE" })),
          ms,
        );
      }),
    ]);
  } finally {
    // Cancelled on the winning path too. A 10 second timer left armed after a successful send
    // holds the event loop open, which on a serverless invocation is billed time.
    clearTimeout(timer);
  }
}

export async function sendViaSmtp(message: MailMessage): Promise<MailResult> {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.MAIL_FROM?.trim();
  if (!host || !from) {
    const missing = [!host && "SMTP_HOST", !from && "MAIL_FROM"].filter(Boolean).join(", ");
    console.warn(`[mail] not sent, unset: ${missing}`);
    return { ok: false, reason: "not-configured" };
  }

  const port = Number(process.env.SMTP_PORT?.trim() || "1025");
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD?.trim();

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      // Implicit TLS is port 465 only. Mailpit on 1025 speaks plaintext, and a relay on 587
      // upgrades with STARTTLS, which nodemailer does on its own when secure is false.
      secure: port === 465,
      // Mailpit accepts anything and needs no credentials, so auth is omitted rather than sent
      // empty: an empty user makes nodemailer offer AUTH LOGIN with a blank name, which Mailpit
      // accepts and a real relay rejects.
      auth: user && password ? { user, pass: password } : undefined,
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
      // The fourth phase, and the one nodemailer leaves at 30 seconds when it is not named. See
      // withDeadline above for why it sits outside all three timeouts on the lines before it.
      dnsTimeout: TIMEOUT_MS,
    });

    const send = transporter.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    // Once the deadline wins the race nothing is awaiting `send` any more, and nodemailer will
    // still reject it of its own accord later. An unhandled rejection is fatal under Node's
    // default, so a send this function has given up on must still be somebody's responsibility.
    send.catch(() => {});

    await withDeadline(send, TIMEOUT_MS);

    console.info("[mail] sent via smtp");
    return { ok: true };
  } catch (error) {
    // The raw error is never forwarded, and neither is its .message. nodemailer's own SMTP
    // rejections embed the recipient verbatim, e.g. "550 5.1.1 <addr>: Recipient address
    // rejected", and that string becomes Error#message: the same shape the Resend transport
    // guards against by extracting only { status } rather than the response body. Two fields are
    // safe to report because neither can carry an address: `code` is nodemailer's own classification
    // (ECONNREFUSED, ETIMEDOUT, EENVELOPE, ...) and `responseCode` is the bare SMTP status number
    // (421, 550, ...). Both are read defensively, since a synchronous throw from createTransport
    // (a malformed SMTP_PORT, for one) may not be a nodemailer SMTPError at all.
    const code = hasStringOrNumber(error, "code") ? error.code : undefined;
    const responseCode = hasNumber(error, "responseCode") ? error.responseCode : undefined;
    reportError({
      where: "mail/smtp",
      error: new Error("SMTP send failed"),
      context: { code, responseCode },
    });
    return { ok: false, reason: "failed" };
  }
}

function hasStringOrNumber<K extends string>(
  value: unknown,
  key: K,
): value is Record<K, string | number> {
  if (typeof value !== "object" || value === null || !(key in value)) return false;
  const field = (value as Record<K, unknown>)[key];
  return typeof field === "string" || typeof field === "number";
}

function hasNumber<K extends string>(value: unknown, key: K): value is Record<K, number> {
  if (typeof value !== "object" || value === null || !(key in value)) return false;
  return typeof (value as Record<K, unknown>)[key] === "number";
}
