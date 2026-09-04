import { describe, expect, it } from "vitest";
import { passwordResetEmail } from "../password-reset-email";

// The message is a pure function, so everything worth guarding about it can be asserted without a
// network and without a provider. What is guarded is what a person cannot check by reading the
// template: that the link and its lifetime survive into BOTH bodies, since a reader whose client
// refuses HTML gets the text part and nothing else, and that the HTML asks the reader's client to
// fetch nothing. A remote image is a tracking pixel whether or not it was meant as one, and it is
// also what gets the whole message blocked before the link is ever seen.

const RESET_URL = "https://huella.cecodes.org.co/es/auth/reset?token=abc123";
const EXPIRES_IN_MINUTES = 60;

const email = passwordResetEmail({ resetUrl: RESET_URL, expiresInMinutes: EXPIRES_IN_MINUTES });

describe("passwordResetEmail", () => {
  it("carries the reset link in both bodies", () => {
    expect(email.html).toContain(RESET_URL);
    expect(email.text).toContain(RESET_URL);
  });

  it("tells the reader how long the link lasts, in both bodies", () => {
    expect(email.html).toContain(`${EXPIRES_IN_MINUTES} minutos`);
    expect(email.text).toContain(`${EXPIRES_IN_MINUTES} minutos`);
  });

  it("says minute in the singular when the link lasts one", () => {
    const short = passwordResetEmail({ resetUrl: RESET_URL, expiresInMinutes: 1 });
    expect(short.text).toContain("1 minuto ");
    expect(short.text).not.toContain("1 minutos");
  });

  it("references no resource other than the reset link itself", () => {
    const urls = email.html.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    expect([...new Set(urls)]).toEqual([RESET_URL]);

    // The attributes and at-rules that make a client fetch something, none of which appear here.
    expect(email.html).not.toMatch(/<img|<link|\bsrc=|\bbackground=|@import|url\(/i);
  });

  it("escapes the token, so a link with several parameters is not truncated", () => {
    const withParams = passwordResetEmail({
      resetUrl: "https://example.test/reset?token=abc&uid=1",
      expiresInMinutes: EXPIRES_IN_MINUTES,
    });
    expect(withParams.html).toContain("token=abc&amp;uid=1");
    expect(withParams.html).not.toContain("token=abc&uid=1");
  });

  // Written as an escape rather than the character, because the rule applies to this file too.
  it("uses no em dash anywhere, per the house rule", () => {
    for (const part of [email.subject, email.html, email.text]) {
      expect(part).not.toContain("\u2014");
    }
  });

  it("keeps the text part free of markup, so a plain client shows prose", () => {
    expect(email.text).not.toMatch(/<[a-z/]/i);
  });
});
