import { afterEach, describe, expect, it, vi } from "vitest";
import { register } from "../instrumentation";

// The boot hook is the only place this app can kill itself, so what it is willing to die for is
// the whole subject of this file.
//
// It has already got that wrong once, in production. The mail rules lived in the fatal schema, a
// deploy went out with a RESEND_API_KEY that had wrapped when it was pasted, register() exited the
// process, and every route answered 500 including /api/health/live, which does nothing but return
// OK. Edge middleware kept serving, because only the node runtime reaches this file.
//
// So: a variable the app cannot serve without still stops it, and a variable one auxiliary feature
// needs is reported by name and nothing more. process.exit is stubbed rather than trusted, because
// a regression here would otherwise end the test run instead of failing a test.

/** A deployment that can serve. Every variable this hook reads is set, so nothing leaks in. */
const SERVEABLE: Record<string, string> = {
  NEXT_RUNTIME: "nodejs",
  DATABASE_URL: "postgresql://user:pw@db.example.org:6543/postgres",
  SITE_URL: "https://huella.example.org",
  MAIL_TRANSPORT: "",
  MAIL_FROM: "",
  RESEND_API_KEY: "",
  SMTP_HOST: "",
  SMTP_PORT: "",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
};

/**
 * Runs the hook on a stubbed environment and reports what it did to the process.
 *
 * The exit codes are copied out and the spies dropped BEFORE anything is asserted, which is not
 * tidiness. mockRestore() resets the mock as well as restoring the original, so a spy handed to an
 * assertion after being restored has an empty call log: `expect(exit).not.toHaveBeenCalled()` then
 * passes no matter what the hook did, and the test that is supposed to catch a regression to
 * exiting on a mail typo would be the one thing that never fails. Returning a plain array of codes
 * makes that mistake impossible to make again here.
 *
 * process.exit is stubbed rather than trusted for the obvious reason: a regression would otherwise
 * end the test run instead of failing a test. It returns `never` in the type system and returns
 * here, so a test can also assert on what the hook does AFTER the exit line.
 */
function boot(overrides: Record<string, string> = {}) {
  for (const [name, value] of Object.entries({ ...SERVEABLE, ...overrides })) {
    vi.stubEnv(name, value);
  }
  const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  const errors: string[] = [];
  const error = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  });

  let exitCodes: (number | string | null | undefined)[] = [];
  try {
    register();
  } finally {
    exitCodes = exit.mock.calls.map((call) => call[0]);
    exit.mockRestore();
    error.mockRestore();
  }
  return { exitCodes, logged: errors.join("\n") };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("register", () => {
  it("serves on a deployment whose mail is simply off", () => {
    const { exitCodes, logged } = boot();
    expect(exitCodes).toEqual([]);
    expect(logged).toBe("");
  });

  // The exact deploy that caused the outage.
  it("does not exit for a RESEND_API_KEY that wrapped on paste, and names it instead", () => {
    const { exitCodes, logged } = boot({
      MAIL_TRANSPORT: "resend",
      RESEND_API_KEY: "re_LiveKeyThatMustNotBeLogged\nwrapped",
      MAIL_FROM: "CECODES <no-reply@example.org>",
    });
    expect(exitCodes).toEqual([]);
    expect(logged).toContain("RESEND_API_KEY");
    // The reason the app stayed up has to be in the log too, or the next operator reads a warning
    // about mail and starts looking for an outage that is not happening.
    expect(logged).toContain("MAIL IS MISCONFIGURED");
    // A live API key in a log that gets pasted into an issue tracker is a second incident.
    expect(logged).not.toContain("re_LiveKeyThatMustNotBeLogged");
  });

  it("does not exit for any other mail slip either", () => {
    const { exitCodes, logged } = boot({ MAIL_TRANSPORT: "smtp", SMTP_USER: "relay-user" });
    expect(exitCodes).toEqual([]);
    expect(logged).toContain("SMTP_HOST");
    expect(logged).toContain("SMTP_PASSWORD");
  });

  // The other half of the trade. Nothing above may weaken this: a deployment that genuinely cannot
  // serve must still stop before it accepts traffic, so the container exits non-zero and the
  // orchestrator reports a failure instead of a healthy-looking app that 500s every request.
  it("still exits for a variable the app cannot serve without", () => {
    const { exitCodes, logged } = boot({ DATABASE_URL: "" });
    expect(exitCodes).toEqual([1]);
    expect(logged).toContain("DATABASE_URL");
  });

  // Only the node runtime opens the database or sends mail, and the edge bundle has no process to
  // exit. Middleware kept serving through the outage for exactly this reason.
  it("does nothing at all on the edge runtime", () => {
    const { exitCodes, logged } = boot({ NEXT_RUNTIME: "edge", DATABASE_URL: "" });
    expect(exitCodes).toEqual([]);
    expect(logged).toBe("");
  });
});
