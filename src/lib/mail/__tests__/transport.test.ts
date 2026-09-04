import { afterEach, describe, expect, it, vi } from "vitest";

const MESSAGE = { to: "a@b.test", subject: "s", html: "<p>h</p>", text: "t" };

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
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

  // Moved from the deleted mail/send.test.ts: a .env file cannot comment one line out per server,
  // so an operator turning mail off empties MAIL_FROM instead of deleting the line, and docker
  // compose passes that through as "".
  it("reads a blank MAIL_FROM as unset", async () => {
    vi.stubEnv("MAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_valid_key");
    vi.stubEnv("MAIL_FROM", "   ");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { sendMail } = await import("@/lib/mail/transport");

    expect(await sendMail(MESSAGE)).toEqual({ ok: false, reason: "not-configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Moved from the deleted mail/send.test.ts: every failure path was checked there for the key AND
  // for a word of the message, not only the recipient. Distinctive strings throughout, so a broad
  // log line cannot accidentally contain one of them as a coincidental substring.
  it("logs neither the key nor a word of the message, on any path", async () => {
    const API_KEY = "re_LiveKeyThatMustNotBeLogged";
    const richMessage = {
      to: "socio@example.test",
      subject: "Restablece tu contrasena",
      html: '<p><a href="https://example.test/reset?token=t0k3n">Crear</a></p>',
      text: "https://example.test/reset?token=t0k3n",
    };
    const paths: Array<() => void> = [
      () => vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 })),
      () =>
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
          new Response(JSON.stringify({ message: `rejected: ${richMessage.to}` }), { status: 422 }),
        ),
      () => vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connect ECONNREFUSED")),
    ];

    for (const arrange of paths) {
      vi.resetModules();
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
      vi.stubEnv("MAIL_TRANSPORT", "resend");
      vi.stubEnv("RESEND_API_KEY", API_KEY);
      vi.stubEnv("MAIL_FROM", "CECODES <no-reply@example.test>");
      const logged: string[] = [];
      const capture = (...args: unknown[]) => void logged.push(args.map(String).join(" "));
      vi.spyOn(console, "warn").mockImplementation(capture);
      vi.spyOn(console, "info").mockImplementation(capture);
      vi.spyOn(console, "error").mockImplementation(capture);
      arrange();

      const { sendMail } = await import("@/lib/mail/transport");
      await sendMail(richMessage);

      const line = logged.join("\n");
      expect(line).not.toContain(API_KEY);
      expect(line).not.toContain(richMessage.to);
      expect(line).not.toContain(richMessage.subject);
      expect(line).not.toContain(richMessage.html);
      expect(line).not.toContain(richMessage.text);
      expect(line).not.toContain("example.test");
    }
  });
});
