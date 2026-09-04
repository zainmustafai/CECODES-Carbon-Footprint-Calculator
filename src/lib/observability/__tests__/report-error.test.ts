import { describe, expect, it, vi, afterEach } from "vitest";
import { formatErrorReport, reportError } from "../report-error";

// The failure mode this app has to survive is a silently wrong number, and the only thing that
// ever reaches an operator is a line in a container log. These tests pin the two properties that
// make such a line useful: it is machine-readable, and it carries the digest, which is the only
// handle on a server stack the browser never sees.

describe("formatErrorReport", () => {
  it("is a single line of JSON, so a log drain can parse it", () => {
    const line = formatErrorReport({ where: "app error boundary", error: new Error("boom") });
    expect(line).not.toContain("\n");
    expect(() => JSON.parse(line)).not.toThrow();
  });

  it("keeps the digest, the only link between a browser report and a server stack", () => {
    const error = Object.assign(new Error("boom"), { digest: "3141592653" });
    expect(JSON.parse(formatErrorReport({ where: "app error boundary", error })).digest).toBe(
      "3141592653",
    );
  });

  it("records the error's type and message", () => {
    const parsed = JSON.parse(
      formatErrorReport({ where: "reports/export", error: new TypeError("bad cast") }),
    );
    expect(parsed.name).toBe("TypeError");
    expect(parsed.message).toBe("bad cast");
    expect(parsed.where).toBe("reports/export");
  });

  // Context comes from a call site that is, by definition, already going wrong. It must not be
  // able to rewrite the parts of the report an operator reads first.
  it("does not let a context key overwrite the error's own message", () => {
    const parsed = JSON.parse(
      formatErrorReport({
        where: "reports/export",
        error: new Error("the real failure"),
        context: { message: "something harmless", where: "somewhere else" },
      }),
    );
    expect(parsed.message).toBe("the real failure");
    expect(parsed.where).toBe("reports/export");
  });

  it("survives a thrown value that is not an Error at all", () => {
    const parsed = JSON.parse(formatErrorReport({ where: "somewhere", error: "just a string" }));
    expect(parsed.message).toBe("just a string");
  });

  it("carries context, so a report can name the company or the year it died on", () => {
    const parsed = JSON.parse(
      formatErrorReport({
        where: "reports/export",
        error: new Error("boom"),
        context: { reportingYearId: "ry_1" },
      }),
    );
    expect(parsed.reportingYearId).toBe("ry_1");
  });

  // nodemailer's own SMTP rejections embed the recipient verbatim (e.g. "550 5.1.1 <addr>:
  // Recipient address rejected"), which becomes Error#message. This is the defence-in-depth half
  // of that fix: even a caller that forwards such an error unfiltered must not leak it, whether
  // the address sits in the message or was passed through context.
  it("redacts an email address out of the message", () => {
    const line = formatErrorReport({
      where: "mail/smtp",
      error: new Error("550 5.1.1 <victim@example.test>: Recipient address rejected"),
    });
    expect(line).not.toContain("victim@example.test");
    expect(line).toContain("[address redacted]");
  });

  // redact() runs on the whole JSON-stringified line, so an address nested inside context has to
  // be caught the same way as one sitting in a bare message.
  it("redacts an email address out of a JSON-stringified context field", () => {
    const line = formatErrorReport({
      where: "mail/smtp",
      error: new Error("boom"),
      context: { detail: "rejected victim@example.test outright" },
    });
    expect(line).not.toContain("victim@example.test");
    expect(line).toContain("[address redacted]");
  });

  // The failure this guards is not "the address was missed", it is "the address was redacted
  // LATE". A leading character class narrower than the body class does not decline to match, it
  // starts matching partway through, so "o'brien@empresa.co" came out as "o'[address redacted]"
  // and the log carried the first characters of a real address while looking safe. Every local
  // part below is accepted by zod's email rule, so each one can be a stored account.
  it.each([
    ["o'brien@empresa.co", "an apostrophe, which is ordinary in Colombian surnames"],
    ["_ana@empresa.co", "a leading underscore"],
    ["+soporte@empresa.co", "a leading plus"],
    ["'x@empresa.co", "a leading apostrophe"],
  ])("redacts %s whole, leaking no prefix (%s)", (address) => {
    const line = formatErrorReport({
      where: "mail/smtp",
      error: new Error(`550 5.1.1 <${address}>: Recipient address rejected`),
    });
    // The angle brackets are the whole assertion. Checking only that the full address is absent
    // passes on a PARTIAL redaction, which is the actual bug: with a narrow leading class the
    // line reads "<o'[address redacted]>", which contains neither "o'brien@empresa.co" nor
    // "o'brien", so both of the obvious assertions go green while the prefix sits in the log.
    // Requiring the placeholder to butt directly against the "<" is what proves the local part
    // was consumed whole.
    expect(line).toContain("<[address redacted]>");
    expect(line).not.toContain(address);
  });

  // The pattern has to be loose enough to catch a real address and tight enough to leave ordinary
  // text alone; this pins the second half.
  it("does not mangle ordinary text with no address in it", () => {
    const line = formatErrorReport({
      where: "reports/export",
      error: new Error("failed to reach db@5432 while exporting @company report"),
    });
    expect(line).toContain("db@5432");
    expect(line).toContain("@company");
    expect(line).not.toContain("[address redacted]");
  });
});

describe("reportError", () => {
  afterEach(() => vi.restoreAllMocks());

  it("writes the report to the error stream", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    reportError({ where: "app error boundary", error: new Error("boom") });
    expect(spy).toHaveBeenCalledOnce();
    expect(JSON.parse(String(spy.mock.calls[0][0])).message).toBe("boom");
  });

  it("still reports the failure when the context cannot be serialized", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    reportError({ where: "app error boundary", error: new Error("boom"), context: circular });

    // The context is what broke, so the context is what is dropped. Losing the whole report
    // would turn a bad log line into no log line at all.
    const parsed = JSON.parse(String(spy.mock.calls[0][0]));
    expect(parsed.message).toBe("boom");
    expect(parsed.context).toBe("[unserializable]");
  });

  it("never throws, however broken the thing it was given", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() =>
      reportError({ where: "app error boundary", error: new Error("boom"), context: circular }),
    ).not.toThrow();
  });
});
