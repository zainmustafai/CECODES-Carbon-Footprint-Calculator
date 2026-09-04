import nodemailer from "nodemailer";
import { reportError } from "@/lib/observability/report-error";
import type { MailMessage, MailResult } from "@/lib/mail/transport";

// SMTP, for Mailpit in development and test and for any deployment that already has a relay.
//
// Same contract as the Resend transport: nothing throws, nothing about the message is logged.

const TIMEOUT_MS = 10_000;

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
    });

    await transporter.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

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
