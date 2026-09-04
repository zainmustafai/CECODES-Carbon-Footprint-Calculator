import { afterEach, describe, expect, it, vi } from "vitest";

const MESSAGE = { to: "a@b.test", subject: "s", html: "<p>h</p>", text: "t" };

// nodemailer itself is mocked, not a real socket: sendViaSmtp is exercised through the real
// module, but what it talks to is this stand-in. Built with vi.hoisted so the same mock instances
// back every dynamic import of transports/smtp.ts, including across vi.resetModules() calls.
const { sendMailMock, createTransportMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn();
  const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));
  return { sendMailMock, createTransportMock };
});

vi.mock("nodemailer", () => ({
  default: { createTransport: createTransportMock },
}));

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  sendMailMock.mockReset();
  createTransportMock.mockClear();
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

  // Moved from the deleted mail/send.test.ts: a stalled provider connection would otherwise hold
  // the Server Action open until the platform kills the request, with the user watching a spinner
  // for a message that was never going to arrive.
  it("bounds the resend call, so a stalled provider cannot hold the request open", async () => {
    vi.stubEnv("MAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_valid_key");
    vi.stubEnv("MAIL_FROM", "CECODES <no-reply@x.test>");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const { sendMail } = await import("@/lib/mail/transport");

    await sendMail(MESSAGE);

    const signal = fetchMock.mock.calls[0]![1]!.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal!.aborted).toBe(false);
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

  describe("smtp", () => {
    function stubSmtpEnv(overrides: Record<string, string> = {}) {
      vi.stubEnv("MAIL_TRANSPORT", "smtp");
      vi.stubEnv("SMTP_HOST", "mailpit");
      vi.stubEnv("MAIL_FROM", "CECODES <no-reply@x.test>");
      for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value);
    }

    it("sends successfully via smtp", async () => {
      stubSmtpEnv();
      sendMailMock.mockResolvedValue(undefined);

      const { sendMail } = await import("@/lib/mail/transport");
      expect(await sendMail(MESSAGE)).toEqual({ ok: true });
      expect(sendMailMock).toHaveBeenCalledTimes(1);
    });

    // The regression this whole block exists to catch: nodemailer's own SMTP rejection messages
    // embed the recipient verbatim, e.g. "550 5.1.1 <victim@example.test>: Recipient address
    // rejected", and this must never reach console.error, which is exactly the fact "who asked
    // for a password reset" must never carry into a log a container operator reads.
    it("never logs the recipient address when the smtp send fails, even though nodemailer's own error message carries it", async () => {
      const address = "victim@example.test";
      stubSmtpEnv();
      const smtpError = Object.assign(
        new Error(`550 5.1.1 <${address}>: Recipient address rejected: User unknown in table`),
        { code: "EENVELOPE", responseCode: 550 },
      );
      sendMailMock.mockRejectedValue(smtpError);
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const { sendMail } = await import("@/lib/mail/transport");
      const result = await sendMail({ ...MESSAGE, to: address });

      expect(result).toEqual({ ok: false, reason: "failed" });
      const logged = errorSpy.mock.calls
        .flat()
        .map(String)
        .join("\n");
      expect(logged).not.toContain(address);
    });

    // A malformed SMTP_PORT (an operator's typo, or a variable that never got numeric in the
    // first place) must not turn into an uncaught exception: nodemailer's own createTransport can
    // throw synchronously on a bad port, and that has to come back as an ordinary MailResult like
    // every other failure this function reports.
    it("returns a MailResult rather than throwing when SMTP_PORT is malformed", async () => {
      stubSmtpEnv({ SMTP_PORT: "not-a-number" });
      createTransportMock.mockImplementationOnce(() => {
        throw new RangeError("invalid port");
      });

      const { sendMail } = await import("@/lib/mail/transport");
      await expect(sendMail(MESSAGE)).resolves.toEqual({ ok: false, reason: "failed" });
    });

    // The guard this covers is the one an operator actually trips: SMTP_HOST or MAIL_FROM absent
    // (or blank, which a shell that empties rather than deletes a .env line produces the same as
    // absent) must refuse up front, before nodemailer is ever asked to do anything, and must say
    // which variable is missing without ever attempting a send.
    describe("refuses to attempt a send when required configuration is missing", () => {
      it("names SMTP_HOST when it is unset, and does not mention MAIL_FROM, which is present", async () => {
        stubSmtpEnv();
        vi.stubEnv("SMTP_HOST", undefined);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        const { sendMail } = await import("@/lib/mail/transport");
        expect(await sendMail(MESSAGE)).toEqual({ ok: false, reason: "not-configured" });

        expect(createTransportMock).not.toHaveBeenCalled();
        expect(sendMailMock).not.toHaveBeenCalled();
        const logged = warn.mock.calls.flat().map(String).join(" ");
        expect(logged).toContain("SMTP_HOST");
        expect(logged).not.toContain("MAIL_FROM");
        // Same rule as every other path through this transport: nothing about the message,
        // recipient included, belongs in a log that a container operator reads.
        expect(logged).not.toContain(MESSAGE.to);
      });

      it("names MAIL_FROM when it is blank, and does not mention SMTP_HOST, which is present", async () => {
        stubSmtpEnv();
        vi.stubEnv("MAIL_FROM", "   ");
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        const { sendMail } = await import("@/lib/mail/transport");
        expect(await sendMail(MESSAGE)).toEqual({ ok: false, reason: "not-configured" });

        expect(createTransportMock).not.toHaveBeenCalled();
        expect(sendMailMock).not.toHaveBeenCalled();
        const logged = warn.mock.calls.flat().map(String).join(" ");
        expect(logged).toContain("MAIL_FROM");
        expect(logged).not.toContain("SMTP_HOST");
        expect(logged).not.toContain(MESSAGE.to);
      });
    });

    // SMTP_USER/SMTP_PASSWORD are optional (Mailpit needs neither), but a real relay behind this
    // transport does, and the comment above the `auth` field explains why an empty user is not
    // sent as empty credentials: it has to be genuinely absent (undefined), or omitted entirely.
    // This is the other side of that guard: BOTH configured must actually reach nodemailer.
    it("passes SMTP_USER and SMTP_PASSWORD through to nodemailer as auth when both are set", async () => {
      stubSmtpEnv({ SMTP_USER: "relay-user", SMTP_PASSWORD: "relay-pass" });
      sendMailMock.mockResolvedValue(undefined);

      const { sendMail } = await import("@/lib/mail/transport");
      expect(await sendMail(MESSAGE)).toEqual({ ok: true });

      expect(createTransportMock).toHaveBeenCalledTimes(1);
      const config = createTransportMock.mock.calls[0] as unknown as [
        { auth?: { user: string; pass: string } },
      ];
      expect(config[0].auth).toEqual({ user: "relay-user", pass: "relay-pass" });
    });

    // The comment above `code`/`responseCode` in smtp.ts says both are read defensively "since a
    // synchronous throw from createTransport ... may not be a nodemailer SMTPError at all", i.e.
    // `code` is not guaranteed to be nodemailer's usual string classification (ECONNREFUSED, ...).
    // Every other test in this file only ever produces a string `code`, so the numeric branch of
    // that check has never run. Nothing stops a thrown error from carrying a numeric one instead.
    it("still classifies the failure when the thrown error's code is a number rather than nodemailer's usual string", async () => {
      stubSmtpEnv();
      const oddError = Object.assign(new Error("connection reset"), { code: 104 });
      sendMailMock.mockRejectedValue(oddError);
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const { sendMail } = await import("@/lib/mail/transport");
      expect(await sendMail(MESSAGE)).toEqual({ ok: false, reason: "failed" });

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const reported = JSON.parse(errorSpy.mock.calls[0]![0] as string);
      expect(reported.code).toBe(104);
      expect(errorSpy.mock.calls.flat().map(String).join("\n")).not.toContain(MESSAGE.to);
    });
  });
});
