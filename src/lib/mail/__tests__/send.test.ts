import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { sendMail } from "../send";

// What is worth pinning here is not that a POST goes out. It is the three promises this module
// makes to its caller, none of which a reader can check by looking at the file:
//
//   It never throws. The caller is the password-reset action, which must answer identically for a
//   real address and an invented one, so an exception escaping this function is an account
//   enumeration oracle.
//   It never logs the message. Who asked for a password reset is exactly the fact these logs must
//   not carry, and the provider quotes the address back inside its error body.
//   It never logs the API key. `fetch` puts a rejected header value into the TypeError it throws,
//   so a key with a stray newline in it reaches the log unless something stops it first.
//
// The fetch stand-in therefore builds real `Headers` from the init it is handed. Without that it
// would accept a header value the runtime rejects, and the test for the third promise would pass
// against code that leaks the key.

const MESSAGE = {
  to: "socio@example.test",
  subject: "Restablece tu contrasena",
  html: '<p><a href="https://example.test/reset?token=t0k3n">Crear</a></p>',
  text: "https://example.test/reset?token=t0k3n",
};

const API_KEY = "re_LiveKeyThatMustNotBeLogged";
const FROM = "CECODES <no-reply@example.test>";

/** Everything the process wrote, whichever console method it used. */
let logged: string[] = [];

function captureConsole() {
  const capture = (...args: unknown[]) => void logged.push(args.map(String).join(" "));
  vi.spyOn(console, "warn").mockImplementation(capture);
  vi.spyOn(console, "info").mockImplementation(capture);
  vi.spyOn(console, "error").mockImplementation(capture);
}

/** A provider that answers `status`, and validates headers the way the real runtime does. */
function stubProvider(status = 200, body = '{"id":"e1"}') {
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    new Headers(init.headers);
    return new Response(body, { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  logged = [];
  captureConsole();
  process.env.RESEND_API_KEY = API_KEY;
  process.env.MAIL_FROM = FROM;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
});

describe("sendMail", () => {
  it("hands the provider both bodies and the key, as one JSON POST", async () => {
    const fetchMock = stubProvider();

    await expect(sendMail(MESSAGE)).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${API_KEY}`);
    expect(JSON.parse(String(init.body))).toEqual({
      from: FROM,
      to: [MESSAGE.to],
      subject: MESSAGE.subject,
      html: MESSAGE.html,
      text: MESSAGE.text,
    });
  });

  // A stalled provider connection would otherwise hold the Server Action open until the platform
  // kills the request, with the user watching a spinner for a message that was never going to
  // arrive.
  it("bounds the call, so a stalled provider cannot hold the request open", async () => {
    const fetchMock = stubProvider();

    await sendMail(MESSAGE);

    const signal = fetchMock.mock.calls[0]![1].signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal!.aborted).toBe(false);
  });

  it("does not reach the provider at all when nothing is configured", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.MAIL_FROM;
    const fetchMock = stubProvider();

    await expect(sendMail(MESSAGE)).resolves.toEqual({ ok: false, reason: "not-configured" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logged.join("\n")).toContain("RESEND_API_KEY, MAIL_FROM");
  });

  // An operator cannot comment one line out per server, so they empty the variable instead and
  // docker compose passes that through as "".
  it("reads a blank variable as an unset one", async () => {
    process.env.MAIL_FROM = "   ";
    const fetchMock = stubProvider();

    await expect(sendMail(MESSAGE)).resolves.toEqual({ ok: false, reason: "not-configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns rather than throws when the provider rejects the request", async () => {
    stubProvider(422, JSON.stringify({ message: `Invalid \`to\` field: ${MESSAGE.to}` }));

    await expect(sendMail(MESSAGE)).resolves.toEqual({ ok: false, reason: "failed" });
    expect(logged.join("\n")).toContain("422");
  });

  it("returns rather than throws when the connection fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    await expect(sendMail(MESSAGE)).resolves.toEqual({ ok: false, reason: "failed" });
  });

  // The regression that prompted the guard: `Headers` throws `"Bearer re_... " is an invalid
  // header value`, quoting the key, and that message is what the catch reports to the log.
  it("keeps a key it cannot use out of the request and out of the log", async () => {
    process.env.RESEND_API_KEY = "re_first_half\nre_second_half";
    const fetchMock = stubProvider();

    const result = await sendMail(MESSAGE);

    // Asserted before the result, because the leak is the failure this test exists to name.
    for (const half of ["re_first_half", "re_second_half"]) {
      expect(logged.join("\n")).not.toContain(half);
    }
    expect(logged.join("\n")).toContain("RESEND_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, reason: "not-configured" });
  });

  it("logs neither the key nor a word of the message, on any path", async () => {
    const paths: Array<() => void> = [
      () => stubProvider(),
      () => stubProvider(500, '{"message":"internal"}'),
      () => {
        vi.stubGlobal(
          "fetch",
          vi.fn(async () => {
            throw new Error("connect ECONNREFUSED");
          }),
        );
      },
      () => {
        delete process.env.MAIL_FROM;
        stubProvider();
      },
    ];

    for (const arrange of paths) {
      logged = [];
      arrange();
      await sendMail(MESSAGE);

      const line = logged.join("\n");
      expect(line).not.toContain(API_KEY);
      expect(line).not.toContain(MESSAGE.to);
      expect(line).not.toContain(MESSAGE.subject);
      expect(line).not.toContain(MESSAGE.html);
      expect(line).not.toContain(MESSAGE.text);
      expect(line).not.toContain("example.test");
    }
  });
});
