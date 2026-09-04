import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TEMPLATE_NAMES, renderTemplate } from "@/lib/mail/render";

const TEMPLATES_DIR = join(import.meta.dirname, "..", "templates");

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

/**
 * Finds every attribute inside every HTML tag of `html` whose value is a bare `{{...}}`
 * interpolation with no surrounding quotes, e.g. `href={{resetUrl}}`. Returns the attribute
 * names found, in source order, so a caller can name them in a failure message.
 *
 * Deliberately not a full HTML parser: it looks only for `name=` directly followed by `{{`, with
 * no quote character in between. `href="{{resetUrl}}"` does not match (a `"` sits between `=` and
 * `{{`), and plain text-node interpolation like `<p>{{expiry}}</p>` is never inside a matched tag
 * span to begin with, so neither is ever reported.
 */
function findUnquotedAttributeInterpolations(html: string): string[] {
  const offenders: string[] = [];
  for (const tag of html.match(/<[a-zA-Z][^<>]*>/g) ?? []) {
    for (const attr of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(\{\{[^{}]*\}\})/g)) {
      offenders.push(attr[1]!);
    }
  }
  return offenders;
}

describe("template source guards", () => {
  it("guards unquoted attributes", () => {
    // render.ts narrows Handlebars' escaper to the five standard HTML entities (see its top-of-
    // file comment): unlike Handlebars' default, it does not encode "=" or a backtick, which is
    // what upstream normally uses to stop an unquoted attribute value from injecting a second
    // attribute. These .hbs files are edited on disk by design (an operator can `docker cp` a fix
    // into a running container without a rebuild), so nothing at compile time stops a future edit
    // from writing `href={{resetUrl}}` instead of `href="{{resetUrl}}"`. This test is the guard
    // that catches that at test time instead of leaving it an assumption.
    const files = readdirSync(TEMPLATES_DIR).filter((file) => file.endsWith(".hbs"));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const html = readFileSync(join(TEMPLATES_DIR, file), "utf8");
      const offenders = findUnquotedAttributeInterpolations(html);
      expect(offenders, `${file} interpolates into unquoted attribute(s): ${offenders.join(", ")}`).toEqual([]);
    }
  });
});
