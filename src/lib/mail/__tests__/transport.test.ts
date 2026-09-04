import { afterEach, describe, expect, it, vi } from "vitest";

const MESSAGE = { to: "a@b.test", subject: "s", html: "<p>h</p>", text: "t" };

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("sendMail", () => {
  it("returns not-configured when MAIL_TRANSPORT is unset", async () => {
    vi.stubEnv("MAIL_TRANSPORT", "");
    const { sendMail } = await import("@/lib/mail/transport");
    expect(await sendMail(MESSAGE)).toEqual({ ok: false, reason: "not-configured" });
  });

  it("returns not-configured when resend is selected without a key", async () => {
    vi.stubEnv("MAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("MAIL_FROM", "CECODES <no-reply@x.test>");
    const { sendMail } = await import("@/lib/mail/transport");
    expect(await sendMail(MESSAGE)).toEqual({ ok: false, reason: "not-configured" });
  });

  it("refuses an API key that is not a usable header value, without quoting it", async () => {
    vi.stubEnv("MAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_broken\nkey");
    vi.stubEnv("MAIL_FROM", "CECODES <no-reply@x.test>");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { sendMail } = await import("@/lib/mail/transport");

    expect(await sendMail(MESSAGE)).toEqual({ ok: false, reason: "not-configured" });
    // fetch would throw "Bearer re_broken\nkey is an invalid header value" and reportError would
    // then write the whole key to the log. Turning it away here is what keeps it out of the line.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warn.mock.calls.flat().join(" ")).not.toContain("re_broken");
  });

  it("never throws when the provider is unreachable", async () => {
    vi.stubEnv("MAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_valid_key");
    vi.stubEnv("MAIL_FROM", "CECODES <no-reply@x.test>");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    const { sendMail } = await import("@/lib/mail/transport");
    expect(await sendMail(MESSAGE)).toEqual({ ok: false, reason: "failed" });
  });

  it("never logs the recipient", async () => {
    vi.stubEnv("MAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_valid_key");
    vi.stubEnv("MAIL_FROM", "CECODES <no-reply@x.test>");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { sendMail } = await import("@/lib/mail/transport");

    expect(await sendMail(MESSAGE)).toEqual({ ok: true });
    // "who asked for a password reset" is exactly the fact these logs must not carry.
    expect(info.mock.calls.flat().join(" ")).not.toContain("a@b.test");
  });
});
