import { HEADER_SAFE_VALUE } from "@/lib/env";
import { reportError } from "@/lib/observability/report-error";
import type { MailMessage, MailResult } from "@/lib/mail/transport";

// Resend, one POST wide. Deliberately the REST endpoint and not the `resend` package: the API is a
// single JSON POST, so the package would buy nothing but a dependency to keep current and another
// module for the standalone build to trace.
//
// Nothing in this file throws. Its caller is the password reset action, which has to behave
// identically whether or not the address belongs to an account: an exception escaping here would
// surface as a different response for a real address than for an invented one, which is an account
// enumeration oracle handed out for free.

const ENDPOINT = "https://api.resend.com/emails";

/** Past a healthy Resend call, well short of any request timeout above us. */
const TIMEOUT_MS = 10_000;

export async function sendViaResend(message: MailMessage): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim();

  if (!apiKey || !from) {
    const missing = [!apiKey && "RESEND_API_KEY", !from && "MAIL_FROM"].filter(Boolean).join(", ");
    console.warn(`[mail] not sent, unset: ${missing}`);
    return { ok: false, reason: "not-configured" };
  }
  // Checked BEFORE the key reaches the request: fetch quotes the offending value back at you, that
  // error is what reportError would write, and a key that wrapped when it was pasted into a .env
  // file would then print in full, once per reset attempt, in the one log an operator is most
  // likely to ship somewhere else.
  //
  // The shape itself lives in src/lib/env.ts, and this check is the LAST line of defence rather
  // than a spare one. That file used to refuse the boot over a key like this, which made reaching
  // this line nearly impossible; refusing the boot also meant one mail typo answered 500 on every
  // route, so the rule now reports at boot and the process serves. A deployment with an unusable
  // key therefore runs, and this code path is ordinary rather than theoretical.
  //
  // What stands between such a deployment and a send is mailConfigured(), which reads the same
  // rule and answers false, so the two callers that mail today refuse before a token row is
  // written. That guard lives in another file and is a decision each caller makes; this one is a
  // property of the request being about to go out, and it is the only check a future caller
  // cannot forget to make. One constant, read by both, so the two cannot drift apart.
  if (!HEADER_SAFE_VALUE.test(apiKey)) {
    console.warn("[mail] not sent, RESEND_API_KEY is not a usable header value");
    return { ok: false, reason: "not-configured" };
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      // The status, and nothing else. Resend quotes the offending address back in its error body.
      reportError({
        where: "mail/resend",
        error: new Error("Resend rejected the request"),
        context: { status: response.status },
      });
      return { ok: false, reason: "failed" };
    }

    console.info(`[mail] sent via resend (${response.status})`);
    return { ok: true };
  } catch (error) {
    reportError({ where: "mail/resend", error });
    return { ok: false, reason: "failed" };
  }
}
