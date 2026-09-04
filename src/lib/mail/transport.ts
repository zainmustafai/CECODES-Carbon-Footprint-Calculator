import { mailTransport } from "@/lib/env";

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
  switch (mailTransport()) {
    case "smtp": {
      // Imported lazily so that a Resend-only deployment never loads nodemailer, and so that a
      // missing SMTP dependency cannot break the module graph for everyone.
      const { sendViaSmtp } = await import("@/lib/mail/transports/smtp");
      return sendViaSmtp(message);
    }
    case "resend": {
      const { sendViaResend } = await import("@/lib/mail/transports/resend");
      return sendViaResend(message);
    }
    default:
      // A deployment with no mail configured is a normal state, not an error: it is what a trial
      // run looks like. Callers check mailConfigured() first and refuse the reset up front.
      console.warn("[mail] not sent, MAIL_TRANSPORT is not set");
      return { ok: false, reason: "not-configured" };
  }
}
