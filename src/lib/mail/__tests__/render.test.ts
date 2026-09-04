import { describe, expect, it } from "vitest";
import { TEMPLATE_NAMES, renderTemplate } from "@/lib/mail/render";

describe("renderTemplate", () => {
  it("every declared template resolves to a readable file", () => {
    // The failure this catches is a template missing from the standalone build, which would
    // otherwise surface only to a user who needed a password.
    for (const name of TEMPLATE_NAMES) {
      expect(() => renderTemplate(name, { resetUrl: "https://x.test/r", expiry: "30 minutos" })).not.toThrow();
    }
  });

  it("wraps the body in the shared layout", () => {
    const html = renderTemplate("reset-password", { resetUrl: "https://x.test/r", expiry: "30 minutos" });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("https://x.test/r");
  });

  it("escapes interpolated values", () => {
    const html = renderTemplate("reset-password", {
      resetUrl: "https://x.test/r?a=1&b=2",
      expiry: "30 minutos",
    });
    // Handlebars {{ }} escapes by default. A token is the one part of this document that is not
    // a literal written by us, so it must never be emitted through {{{ }}}.
    expect(html).toContain("a=1&amp;b=2");
    expect(html).not.toContain("a=1&b=2");
  });

  it("throws a named error for an unknown template rather than returning empty output", () => {
    // @ts-expect-error deliberately outside TemplateName
    expect(() => renderTemplate("does-not-exist", {})).toThrow(/does-not-exist/);
  });
});
