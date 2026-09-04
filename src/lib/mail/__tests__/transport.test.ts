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
  // The dispatch-guard tests below replace one transport module with a factory that throws, which
  // is how a dynamic import is made to reject. vi.resetModules() does not clear that registration,
  // so it is lifted here rather than at the end of each test: a test that fails partway through
  // must not leave a poisoned module behind for the rest of the file.
  vi.doUnmock("@/lib/mail/transports/smtp");
  vi.doUnmock("@/lib/mail/transports/resend");
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
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

  // sendMail's docblock says "Never throws", and three call sites take that literally: the
  // password-changed notice in resetPasswordWithTokenAction, the same notice in
  // updatePasswordAction, and the admin rotation notice in user-actions.ts all `await sendMail(...)`
  // bare, after the write has committed. The first of those is the one that hurts: the password is
  // already changed, the token already spent and every session already destroyed, so a throw
  // escaping sendMail rejects a Server Action that SUCCEEDED, and use-reset-password.ts only reads
  // the returned error key - the form stops its spinner and says nothing at all while the new
  // password is live. The user retries the link, is told it is invalid, and concludes the reset
  // never happened.
  //
  // The dispatch itself was the hole: `await import(...)` sat outside any try block, so a
  // transport module missing from a trimmed standalone image, or one that throws at module scope,
  // rejected straight out of sendMail. These tests hold the docblock to its word.
  describe("the guarantee that it never throws", () => {
    function stubResendEnv() {
      vi.stubEnv("MAIL_TRANSPORT", "resend");
      vi.stubEnv("RESEND_API_KEY", "re_valid_key");
      vi.stubEnv("MAIL_FROM", "CECODES <no-reply@x.test>");
    }

    it("returns a failure result rather than throwing when the resend module cannot be loaded", async () => {
      stubResendEnv();
      vi.resetModules();
      // What a module missing from an `output: "standalone"` image looks like from the inside.
      vi.doMock("@/lib/mail/transports/resend", () => {
        throw new Error("Cannot find module '@/lib/mail/transports/resend'");
      });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const { sendMail } = await import("@/lib/mail/transport");
      await expect(sendMail(MESSAGE)).resolves.toEqual({ ok: false, reason: "failed" });

      // Silence would be worse than the throw: the failure has to reach the one seam the app
      // reports through, or a deployment missing a transport looks exactly like a healthy one.
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const reported = errorSpy.mock.calls[0]![0] as string;
      expect(reported).toContain("mail/dispatch");
    });

    it("returns a failure result rather than throwing when the smtp module cannot be loaded", async () => {
      vi.stubEnv("MAIL_TRANSPORT", "smtp");
      vi.stubEnv("SMTP_HOST", "mailpit");
      vi.stubEnv("MAIL_FROM", "CECODES <no-reply@x.test>");
      vi.resetModules();
      vi.doMock("@/lib/mail/transports/smtp", () => {
        throw new Error("Cannot find module '@/lib/mail/transports/smtp'");
      });
      vi.spyOn(console, "error").mockImplementation(() => {});

      const { sendMail } = await import("@/lib/mail/transport");
      await expect(sendMail(MESSAGE)).resolves.toEqual({ ok: false, reason: "failed" });
    });

    // A transport that loads and then throws synchronously, rather than returning a MailResult,
    // is the same failure one frame further in. The guarantee is about sendMail's own contract,
    // not about where inside the dispatch something went wrong.
    it("returns a failure result rather than throwing when the transport itself throws", async () => {
      stubResendEnv();
      vi.resetModules();
      vi.doMock("@/lib/mail/transports/resend", () => ({
        sendViaResend: () => {
          throw new TypeError("fetch is not a function");
        },
      }));
      vi.spyOn(console, "error").mockImplementation(() => {});

      const { sendMail } = await import("@/lib/mail/transport");
      await expect(sendMail(MESSAGE)).resolves.toEqual({ ok: false, reason: "failed" });
    });

    // The same rule that governs every other path through this file. A module-resolution error
    // carries no address, but the guard must not become the one place that starts forwarding a
    // raw error, because the NEXT error to arrive here may well carry one.
    it("never logs the recipient while reporting a dispatch failure", async () => {
      const address = "socio@example.test";
      stubResendEnv();
      vi.resetModules();
      vi.doMock("@/lib/mail/transports/resend", () => {
        throw new Error(`module load failed while sending to ${address}`);
      });
      const logged: string[] = [];
      const capture = (...args: unknown[]) => void logged.push(args.map(String).join(" "));
      vi.spyOn(console, "error").mockImplementation(capture);
      vi.spyOn(console, "warn").mockImplementation(capture);
      vi.spyOn(console, "info").mockImplementation(capture);

      const { sendMail } = await import("@/lib/mail/transport");
      expect(await sendMail({ ...MESSAGE, to: address })).toEqual({ ok: false, reason: "failed" });

      expect(logged.join("\n")).not.toContain(address);
    });
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

    // The Resend transport bounds itself with AbortSignal.timeout(10_000), and the reason it does
    // is written above that line: a stalled provider would otherwise hold the Server Action open
    // until the platform kills the request, with the user watching a spinner for a message that was
    // never going to arrive. SMTP had no equivalent, and its three phase timeouts do not add up to
    // one, for two reasons verified against the installed nodemailer@10.0.0:
    //
    //  - smtp-connection's connect() resolves the hostname BEFORE any socket exists, under
    //    `dnsTimeout` (const DNS_TIMEOUT = 30 * 1000, used as `this.options.dnsTimeout ||
    //    DNS_TIMEOUT`). connectionTimeout is armed later, in _setupConnectionHandlers(), which only
    //    runs once _connectToHost() has created the socket. A host behind a black-holed resolver
    //    therefore burns 30s before the 10s connection budget starts.
    //  - _onConnectionError() walks _fallbackAddresses and calls _connectToHost() again for each,
    //    which arms a FRESH connectionTimeout every time. Four A records that all drop SYNs cost
    //    4 x connectionTimeout, not one.
    //
    // These two tests pin the two halves of the answer.
    describe("the wall-clock bound", () => {
      it("bounds hostname resolution, which none of the three phase timeouts covers", async () => {
        stubSmtpEnv();
        sendMailMock.mockResolvedValue(undefined);

        const { sendMail } = await import("@/lib/mail/transport");
        expect(await sendMail(MESSAGE)).toEqual({ ok: true });

        const config = createTransportMock.mock.calls[0] as unknown as [{ dnsTimeout?: number }];
        // Left unset, nodemailer's own default is 30s, three times the budget every other phase
        // of the same send is held to.
        expect(config[0].dnsTimeout).toBeGreaterThan(0);
        expect(config[0].dnsTimeout).toBeLessThanOrEqual(10_000);
      });

      it("returns a failure result on a deadline of its own when the send never settles", async () => {
        stubSmtpEnv();
        // A send that resolves neither way: what a black-holed resolver, or a run through several
        // dead A records, looks like from this side of nodemailer.
        sendMailMock.mockReturnValue(new Promise(() => {}));
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        // The transport is called directly here, and only here, rather than through sendMail.
        // sendMail imports it lazily, so a send routed through it does not begin until the module
        // has been read off disk, and advanceTimersByTimeAsync drains MICROTASKS only: it never
        // gives the loop the real turn that I/O needs. Going through sendMail would make this test
        // a race against vitest's module loader under whatever else the suite is doing in
        // parallel, rather than a measurement of the deadline. Everything from here to the
        // setTimeout inside withDeadline is synchronous, so the timer is armed by the time the
        // call below returns.
        const { sendViaSmtp } = await import("@/lib/mail/transports/smtp");
        vi.useFakeTimers();
        // Deliberately observed through a callback rather than awaited: with no deadline in place
        // this promise never settles at all, and awaiting it would turn a missing bound into a
        // test that hangs until the suite timeout instead of one that fails saying why.
        let settled: unknown;
        void sendViaSmtp(MESSAGE).then((result) => {
          settled = result;
        });

        // Well past any per-phase budget, and past nodemailer's 30s DNS default too.
        await vi.advanceTimersByTimeAsync(60_000);

        expect(settled).toEqual({ ok: false, reason: "failed" });
        // Distinguishable in the log from every other SMTP failure, and from nodemailer's own
        // ETIMEDOUT, which means one phase gave up rather than the whole send running out of time.
        // Without a code of its own a timed-out send reports a bare "SMTP send failed" with no
        // fields at all, which tells an operator nothing about which failure they are looking at.
        const reported = JSON.parse(errorSpy.mock.calls[0]![0] as string);
        expect(reported.code).toBe("EDEADLINE");
        expect(errorSpy.mock.calls.flat().map(String).join("\n")).not.toContain(MESSAGE.to);
      });

      // The other half of a deadline: it has to be cancelled when the send wins. A 10s timer left
      // armed after a successful send keeps the event loop alive, which on a serverless invocation
      // is billed time and on a container is a handle that never clears.
      it("leaves no timer behind once the send succeeds", async () => {
        stubSmtpEnv();
        sendMailMock.mockResolvedValue(undefined);

        // Direct, for the reason the test above gives: under a faked clock a lazy import in front
        // of the send is a race with vitest's module loader, not part of what is being measured.
        const { sendViaSmtp } = await import("@/lib/mail/transports/smtp");
        vi.useFakeTimers();
        expect(await sendViaSmtp(MESSAGE)).toEqual({ ok: true });

        expect(vi.getTimerCount()).toBe(0);
      });
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
