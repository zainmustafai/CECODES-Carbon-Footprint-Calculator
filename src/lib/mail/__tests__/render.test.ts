import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Handlebars from "handlebars";
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
    // The layout's inline partial-block wiring passes `title` through a hash argument
    // (`{{#> layout title="..."}}`) into `{{title}}` inside layout.hbs. Doctype and body presence
    // alone would still pass even if that hash argument silently stopped reaching the partial, so
    // assert the heading text itself renders too.
    expect(html).toContain("Restablece tu contraseña");
  });

  it("escapes interpolated values", () => {
    const html = renderTemplate("reset-password", {
      resetUrl: "https://x.test/r?a=1&b=2",
      expiry: "30 minutos",
    });
    // reset-password.hbs renders resetUrl through the `url` helper (`{{url resetUrl}}`), not a
    // bare `{{resetUrl}}`: a bare interpolation would encode "=" as "&#x3D;" under Handlebars'
    // default escaping (see render.ts's top-of-file comments for why that specifically breaks a
    // reset link), so the helper narrows escaping to the five standard entities for URLs only.
    // The token must still never reach the page unescaped, so "&" is still "&amp;" here.
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

describe("Handlebars environment isolation", () => {
  it("does not weaken the shared Handlebars singleton", () => {
    // Regression guard for a real bug: Handlebars.create() does NOT give each environment its own
    // Utils object. Utils is assigned from one module-scope object shared by every environment
    // (confirmed against the installed handlebars@4.7.9), so an earlier version of render.ts,
    // which mutated `engine.Utils.escapeExpression` believing it was scoped to its own `engine`,
    // was actually rewriting escaping for the process-wide default `Handlebars` export too, for
    // the life of the server, the moment render.ts was imported. render.ts now reaches its
    // narrower URL escaping through a helper registered on its own isolated engine instead (which
    // IS correctly isolated), and touches nothing shared. This test imports render.ts (above) and
    // then exercises the plain default export directly: if render.ts, or a future edit to it, ever
    // mutates something shared again, this is what would catch it.
    const html = Handlebars.compile("{{value}}")({ value: "a=1&b=2" });
    expect(html).toBe("a&#x3D;1&amp;b&#x3D;2");
  });
});

describe("template source guards", () => {
  it("guards unquoted attributes", () => {
    // Every ordinary {{ }} interpolation still gets Handlebars' full default escaping, including
    // its defence against an unquoted attribute. The one exception is the `url` helper (see
    // render.ts's top-of-file comments), whose output is intentionally narrower, so `{{url x}}`
    // used unquoted would not be protected the way a bare `{{x}}` is. These .hbs files are edited
    // on disk by design (an operator can `docker cp` a fix into a running container without a
    // rebuild), so nothing at compile time stops a future edit from writing `href={{url x}}`
    // instead of `href="{{url x}}"`. This test is the guard that catches that at test time instead
    // of leaving it an assumption.
    const files = readdirSync(TEMPLATES_DIR).filter((file) => file.endsWith(".hbs"));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const html = readFileSync(join(TEMPLATES_DIR, file), "utf8");
      const offenders = findUnquotedAttributeInterpolations(html);
      expect(offenders, `${file} interpolates into unquoted attribute(s): ${offenders.join(", ")}`).toEqual([]);
    }
  });
});
