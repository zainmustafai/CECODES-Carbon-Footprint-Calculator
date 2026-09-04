import { reportError } from "@/lib/observability/report-error";

// Outbound email, one POST wide.
//
// Deliberately the REST endpoint and not the `resend` package. The API is a single JSON POST, so
// the package would buy nothing but a dependency to keep current and another module for the
// standalone Docker build to trace and bundle. `fetch` is already in the runtime.
//
// The hard rule here is that nothing in this file throws. Its caller is the password reset action,
// which has to behave identically whether or not the address belongs to an account: an exception
// escaping this function would surface as a different response for a real address than for an
// invented one, which is an account enumeration oracle handed out for free. Every failure path
// therefore returns a MailResult, and the caller ignores it.
//
// Nothing about the message is ever logged. Recipient, subject and body all stay out of the log
// line, because "who asked for a password reset" is exactly the fact these logs must not carry.
// The API key stays out too, which takes more than simply not writing it: see HEADER_SAFE.

const ENDPOINT = "https://api.resend.com/emails";

/**
 * How long the provider gets before the send is abandoned.
 *
 * Without it a stalled provider connection holds the Server Action open until the platform kills
 * the request, and the user watches a spinner for a message that was never going to arrive. Ten
 * seconds is well past a healthy Resend call and well short of any request timeout above us.
 */
const TIMEOUT_MS = 10_000;

export type MailResult = { ok: true } | { ok: false; reason: "not-configured" | "failed" };

/**
 * Visible ASCII, which is every character an API key has and the only range a header value can
 * carry without argument.
 *
 * The key is checked against this before it reaches the request, because `fetch` quotes the
 * offending value back at you: a key with a newline in it makes `Headers` throw
 * `Bearer re_xxx\n... is an invalid header value`, that error is what the catch below reports,
 * and `reportError` writes the message to the log. A key that wrapped when it was pasted into a
 * .env file would print in full, once per reset attempt, in the one log an operator is most
 * likely to ship somewhere else. Turning the malformed key away here is what keeps the secret out
 * of the line; catching the error afterwards is already too late.
 */
const HEADER_SAFE = /^[\x21-\x7e]+$/;

/** The two variables, or the reason they cannot be used. A reason never quotes a value. */
function readConfig(): { apiKey: string; from: string } | { problem: string } {
  // Read per call rather than at module load. This module is imported once per process, while the
  // variables arrive with the container: reading at import time would freeze whatever the first
  // import saw, and would make the tests around a misconfigured deployment untestable.
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim();

  if (!apiKey || !from) {
    const missing: string[] = [];
    if (!apiKey) missing.push("RESEND_API_KEY");
    if (!from) missing.push("MAIL_FROM");
    return { problem: `unset: ${missing.join(", ")}` };
  }

  if (!HEADER_SAFE.test(apiKey)) return { problem: "RESEND_API_KEY is not a usable header value" };

  return { apiKey, from };
}

/**
 * Sends one email. Both bodies are required: `text` is what the client that refuses HTML shows,
 * and a message with no text part is what spam filters score against.
 */
export async function sendMail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<MailResult> {
  const config = readConfig();
  if ("problem" in config) {
    // A deployment with no mail configured is a normal state, not an error: local development runs
    // that way. One warning naming what is wrong is the whole diagnosis, and it says nothing about
    // who the message was for.
    console.warn(`[mail] not sent, ${config.problem}`);
    return { ok: false, reason: "not-configured" };
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      // The status, and nothing else. Resend quotes the offending address back in its error body,
      // so the body cannot be logged even though it is the part that would explain the failure.
      reportError({
        where: "mail/send",
        error: new Error("Resend rejected the request"),
        context: { status: response.status },
      });
      return { ok: false, reason: "failed" };
    }

    // Logged because in a self hosted deployment the entire support path for "the reset email
    // never arrived" is `docker compose logs`, and this line is what separates "we handed it to
    // the provider" from "we never tried".
    console.info(`[mail] sent (${response.status})`);
    return { ok: true };
  } catch (error) {
    // A DNS failure, a refused connection, or the timeout above. reportError never throws.
    reportError({ where: "mail/send", error });
    return { ok: false, reason: "failed" };
  }
}
