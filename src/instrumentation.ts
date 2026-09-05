import { mailConfigured, validateMailConfig, validateRuntimeEnv } from "@/lib/env";

/**
 * Next's boot hook: the one place this app can refuse to start, and the one place it must be
 * careful about what "refuse" costs.
 *
 * A Next app has no main(), so without this a misconfigured deployment starts happily and fails
 * per-request instead, which is exactly the "partially initialized state" a container deployment
 * must avoid. For the variables the app genuinely cannot serve without, DATABASE_URL above all,
 * stopping the server before it accepts traffic is right on both targets: the container exits
 * non-zero and the orchestrator reports a failure, and on Vercel the deployment is dead either
 * way because nothing it could serve would work.
 *
 * That reasoning does NOT extend to every variable, and assuming it did caused an outage. The mail
 * rules used to be part of validateRuntimeEnv, a deploy went out with a RESEND_API_KEY that had
 * wrapped when it was pasted, this hook exited, and every route answered 500 including
 * /api/health/live, which does nothing but return OK. Edge middleware kept serving, which is what
 * pinned the cause: only the node runtime reaches this file. The app was completely able to serve
 * every page it has; one auxiliary feature's typo took the whole site down, and on Vercel the only
 * explanation was a line in the runtime log that nobody sees until they go looking.
 *
 * So the split below is deliberate. validateRuntimeEnv is fatal because it is now only about being
 * able to serve. validateMailConfig is reported, loudly and by name, and the process carries on:
 * the site stays up, and mailConfigured() has already made the mail feature refuse rather than
 * lie, so the damage is bounded to the feature that is actually broken.
 *
 * Runs once per server process, on Vercel and in a container alike.
 */
export function register() {
  // The edge runtime never opens the database and never sends mail, which is all this hook
  // checks; there is nothing to validate there.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    validateRuntimeEnv();
  } catch (error) {
    // Exit rather than rethrow. Next catches a throw from this hook and reports
    // "Failed to prepare server", but the process stays alive and never serves - a container
    // that is running, never healthy, and has no exit code to explain itself. Exiting non-zero
    // makes `docker compose ps` and `docker compose logs` tell the truth immediately.
    console.error(error instanceof Error ? error.message : String(error));

    // Reached through globalThis on purpose. This file is compiled for the edge runtime as well
    // as node, and a literal `process.exit(...)` makes the bundler warn that a Node API is
    // unsupported on edge - even though the guard above means edge never runs this line. Going
    // through globalThis keeps the build output clean, and a build warning nobody can act on is
    // how real warnings end up ignored.
    (globalThis as unknown as { process: { exit(code: number): never } }).process.exit(1);
  }

  // Mail: reported, never fatal. Nothing below can stop the process, and nothing below prints a
  // value, because the variables at fault are API keys and SMTP passwords and these lines end up
  // in logs that get pasted into issue trackers.
  //
  // Loud on purpose. This is the only warning an operator gets, it competes with Next's own boot
  // output, and the consequence it announces is silent by nature: password reset and the welcome
  // mail simply stop working, with no error anywhere a user can see.
  const mailIssues = validateMailConfig();
  if (mailIssues.length > 0) {
    // SITE_URL is the one issue here that does NOT turn mail off, so the banner has to say which
    // of the two situations this is. Announcing "mail is NOT sent" when mail is in fact sending,
    // merely with links built from DOMAIN instead, sends the operator hunting the wrong fault,
    // and a warning that overstates its own consequence is how warnings stop being read.
    //
    // mailConfigured() is the authority on that split, so ask it rather than inferring from the
    // text of the issues. That also means this stays correct on its own if a future rule joins
    // the reported set on either side of the line.
    const consequence = mailConfigured()
      ? [
          "  Mail still sends. Emailed links fall back to DOMAIN or VERCEL_URL,",
          "  so they may point at a hostname other than the one you intended.",
        ]
      : [
          "  Mail is NOT sent. Password reset and the welcome mail are refused",
          "  up front, rather than promising an inbox nothing will reach.",
        ];

    console.error(
      [
        "",
        "================================================================",
        "  MAIL CONFIGURATION PROBLEM. The app is running.",
        ...consequence,
        "",
        ...mailIssues.map((issue) => `  - ${issue}`),
        "",
        "  See .env.example. Fix these and redeploy.",
        "================================================================",
        "",
      ].join("\n"),
    );
  }
}
