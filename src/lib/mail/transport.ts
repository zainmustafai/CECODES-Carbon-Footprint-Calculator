import { mailTransport } from "@/lib/env";
import { reportError } from "@/lib/observability/report-error";

export type MailMessage = { to: string; subject: string; html: string; text: string };
export type MailResult = { ok: true } | { ok: false; reason: "not-configured" | "failed" };

/**
 * Sends one message through whichever transport is configured.
 *
 * Both bodies are required: `text` is what a client that refuses HTML shows, and a message with no
 * text part is what spam filters score against.
 *
 * Never throws. Every failure path returns a MailResult, and the reset action ignores it, because
 * that action must answer identically for a real address and an invented one.
 */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  const transport = mailTransport();

  // The try wraps the WHOLE dispatch, module resolution included, and that is the point of it.
  //
  // "Never throws" above is not a description, it is a contract three callers rely on unguarded:
  // the password-changed notice in resetPasswordWithTokenAction, the same notice in
  // updatePasswordAction, and the admin rotation notice in user-actions.ts each `await sendMail()`
  // bare, after their write has already committed. The first is the one that hurts. By the time it
  // runs the password is the new one, the token is spent and every session is destroyed, so an
  // exception escaping here rejects a Server Action that SUCCEEDED. use-reset-password.ts reads
  // only the returned error key, so the form stops its spinner and says nothing while the new
  // password is live; the user retries the link, is told it is invalid, and reasonably concludes
  // the reset never happened.
  //
  // Each `await import(...)` below used to sit outside any try block, so the two ways a dynamic
  // import rejects went straight out: a transport module missing from a trimmed `output:
  // "standalone"` image, and a module that throws at module scope. Both are deployment states, not
  // hypotheticals, and neither is something a caller can guard against without duplicating this
  // contract at every call site.
  //
  // `return await`, not `return`: a bare `return somePromise` inside a try hands the rejection to
  // the caller rather than to the catch below, which is the whole failure this block exists to
  // stop.
  try {
    switch (transport) {
      case "smtp": {
        // Imported lazily so that a Resend-only deployment never loads nodemailer, and so that a
        // missing SMTP dependency cannot break the module graph for everyone.
        const { sendViaSmtp } = await import("@/lib/mail/transports/smtp");
        return await sendViaSmtp(message);
      }
      case "resend": {
        const { sendViaResend } = await import("@/lib/mail/transports/resend");
        return await sendViaResend(message);
      }
      default:
        // A deployment with no mail configured is a normal state, not an error: it is what a trial
        // run looks like. Callers check mailConfigured() first and refuse the reset up front.
        console.warn("[mail] not sent, MAIL_TRANSPORT is not set");
        return { ok: false, reason: "not-configured" };
    }
  } catch (error) {
    // Forwarded rather than replaced, unlike transports/smtp.ts. That file builds its own Error
    // because nodemailer's SMTP rejections provably embed the recipient in their message; nothing
    // that reaches THIS catch does. What does reach it is "Cannot find module ...", which is the
    // single fact that explains the failure, and dropping it would leave an operator with a mail
    // system that reports one opaque line per attempt. report-error.ts redacts an address out of
    // whatever line it is handed, which is exactly the case its own comment says that rule exists
    // to cover.
    //
    // Reported, never silent: a deployment whose transport module did not survive the image build
    // would otherwise be indistinguishable from a healthy one, since the callers discard the
    // result on purpose.
    reportError({ where: "mail/dispatch", error, context: { transport } });
    return { ok: false, reason: "failed" };
  }
}
