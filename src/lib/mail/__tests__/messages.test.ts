import { describe, expect, it } from "vitest";
import { passwordChangedMessage, resetPasswordMessage, welcomeMessage } from "@/lib/mail/messages";

// These three builders are pure functions of their data (renderTemplate underneath is exercised
// directly by render.test.ts), so what is worth pinning here is what a person cannot check by eye:
// that the link and its lifetime survive into BOTH bodies, that the welcome message never carries
// a password, and that the two password-changed variants read differently for an admin reset
// versus a self-service change.

describe("resetPasswordMessage", () => {
  it("carries the link in both bodies", () => {
    const m = resetPasswordMessage({ to: "u@x.test", resetUrl: "https://x.test/r/abc", expiresInMinutes: 30 });
    expect(m.html).toContain("https://x.test/r/abc");
    expect(m.text).toContain("https://x.test/r/abc");
    expect(m.subject).toBe("Restablece tu contraseña");
  });

  it("pluralizes the expiry in Spanish", () => {
    expect(resetPasswordMessage({ to: "u@x.test", resetUrl: "https://x.test/r", expiresInMinutes: 1 }).text)
      .toContain("1 minuto");
    expect(resetPasswordMessage({ to: "u@x.test", resetUrl: "https://x.test/r", expiresInMinutes: 30 }).text)
      .toContain("30 minutos");
  });

  // Moved from the deleted password-reset-email.test.ts: a remote image or stylesheet is a
  // tracking pixel whether or not it was meant as one, and it is also what gets a message blocked
  // by a spam filter before the link inside it is ever seen.
  it("references no resource other than the reset link itself", () => {
    const m = resetPasswordMessage({
      to: "u@x.test",
      resetUrl: "https://huella.cecodes.org.co/es/reset-password?token=abc123",
      expiresInMinutes: 60,
    });
    const urls = m.html.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    expect([...new Set(urls)]).toEqual(["https://huella.cecodes.org.co/es/reset-password?token=abc123"]);
    expect(m.html).not.toMatch(/<img|<link|\bsrc=|\bbackground=|@import|url\(/i);
  });

  // Moved from the deleted password-reset-email.test.ts.
  it("keeps the text part free of markup, so a plain client shows prose", () => {
    const m = resetPasswordMessage({ to: "u@x.test", resetUrl: "https://x.test/r", expiresInMinutes: 60 });
    expect(m.text).not.toMatch(/<[a-z/]/i);
  });
});

describe("welcomeMessage", () => {
  it("carries a set-password link and never a password", () => {
    const m = welcomeMessage({
      to: "u@x.test",
      name: "Ana",
      setPasswordUrl: "https://x.test/set/abc",
      expiresInMinutes: 60,
    });
    expect(m.html).toContain("https://x.test/set/abc");
    expect(m.html).toContain("Ana");
    // Mailing a working password puts a live credential in an inbox forever.
    expect(m.html.toLowerCase()).not.toContain("contraseña temporal");
  });

  it("reads correctly when the user has no name", () => {
    const m = welcomeMessage({ to: "u@x.test", name: null, setPasswordUrl: "https://x.test/s", expiresInMinutes: 60 });
    expect(m.html).toContain("Se creó una cuenta");
  });

  it("carries the link and expiry in both bodies", () => {
    const m = welcomeMessage({
      to: "u@x.test",
      name: null,
      setPasswordUrl: "https://x.test/set/abc",
      expiresInMinutes: 1,
    });
    expect(m.text).toContain("https://x.test/set/abc");
    expect(m.text).toContain("1 minuto");
  });
});

describe("passwordChangedMessage", () => {
  it("distinguishes an admin reset from a self-service change", () => {
    const at = new Date("2026-09-04T15:00:00Z");
    expect(passwordChangedMessage({ to: "u@x.test", changedAt: at, byAdmin: true }).html)
      .toContain("administrador");
    expect(passwordChangedMessage({ to: "u@x.test", changedAt: at, byAdmin: false }).html)
      .not.toContain("administrador");
  });

  it("carries the date in the text body too", () => {
    const at = new Date("2026-09-04T15:00:00Z");
    const m = passwordChangedMessage({ to: "u@x.test", changedAt: at, byAdmin: false });
    expect(m.subject).toBe("Tu contraseña cambió");
    expect(m.text).toMatch(/\d{4}/);
  });
});

// Moved from the deleted password-reset-email.test.ts: the house rule applies to every message
// this module builds, not only the one file that used to carry it. Written as an escape rather
// than the character, because the rule applies to this file too.
describe("house rules", () => {
  it("uses no em dash anywhere, in any of the three messages", () => {
    const messages = [
      resetPasswordMessage({ to: "u@x.test", resetUrl: "https://x.test/r", expiresInMinutes: 60 }),
      welcomeMessage({ to: "u@x.test", name: "Ana", setPasswordUrl: "https://x.test/s", expiresInMinutes: 60 }),
      passwordChangedMessage({ to: "u@x.test", changedAt: new Date(), byAdmin: true }),
    ];
    for (const m of messages) {
      for (const part of [m.subject, m.html, m.text]) {
        expect(part).not.toContain("\u2014");
      }
    }
  });
});
