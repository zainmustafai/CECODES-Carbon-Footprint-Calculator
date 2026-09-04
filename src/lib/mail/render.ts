import { readFileSync } from "node:fs";
import { join } from "node:path";
import Handlebars from "handlebars";

// Email bodies, compiled from .hbs files on disk.
//
// Read at runtime rather than imported, so an operator can `docker cp` a corrected template into a
// running container and restart it. Two things make that survive `output: "standalone"`, which
// traces imports and would otherwise ship none of these files: outputFileTracingIncludes in
// next.config.ts, and an explicit COPY in the Dockerfile's runner stage. Both, deliberately.

export type TemplateName = "reset-password" | "welcome" | "password-changed";

export const TEMPLATE_NAMES = [
  "reset-password",
  "welcome",
  "password-changed",
] as const satisfies readonly TemplateName[];

// Resolved from cwd, not from import.meta.url. The standalone server runs from /app with the
// templates at /app/src/lib/mail/templates, and __dirname inside a traced bundle does not point
// anywhere useful.
const TEMPLATE_DIR = join(process.cwd(), "src", "lib", "mail", "templates");

// An isolated environment, not the shared module singleton, so the escaper override below cannot
// leak into any other future consumer of the "handlebars" package in this process.
const engine = Handlebars.create();

// Handlebars' default {{ }} escaping HTML-encodes seven characters: & < > " ' ` and =. The last
// two exist to defend an unquoted HTML attribute (<a href={{url}}>): without them, a value
// containing a space or another "=" could inject a second attribute. Every attribute in these
// templates is double-quoted, so that defence is not buying anything here, and its cost is real:
// our reset URLs are themselves query strings like "?token=abc", so the default escaper turns
// every emailed link's href into "...&#x3D;abc". That is valid HTML and a compliant client
// decodes it, but email clients are some of the least compliant renderers in existence, and a
// link an inbox fails to decode is a user who cannot reset their password. Deliverability of a
// link we already control beats defending against an injection vector these templates do not
// expose, so escaping is narrowed to the five standard entities instead, mirroring Handlebars'
// own implementation (handlebars/dist/cjs/handlebars/utils.js) minus ` and =. This is why the
// templates below must keep every interpolated attribute quoted; see render.test.ts's "guards
// unquoted attributes" test, which fails the build if one stops being.
const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};
const HAS_ESCAPABLE_CHAR = /[&<>"']/;
const ESCAPABLE_CHARS = /[&<>"']/g;

function standardEscapeExpression(value: unknown): string {
  if (typeof value !== "string") {
    // Mirrors upstream: pass SafeStrings through untouched, render null/undefined as "", and
    // stringify everything else before testing for characters that need escaping.
    if (value && typeof (value as { toHTML?: unknown }).toHTML === "function") {
      return (value as { toHTML: () => string }).toHTML();
    }
    if (value == null) return "";
    if (!value) return `${value}`;
    value = `${value}`;
  }
  const str = value as string;
  if (!HAS_ESCAPABLE_CHAR.test(str)) return str;
  return str.replace(ESCAPABLE_CHARS, (char) => HTML_ESCAPE[char]!);
}

engine.Utils.escapeExpression = standardEscapeExpression;

// Compiled once per process. Templates cannot change under a running container without a restart,
// so a cache is free correctness rather than a risk.
const cache = new Map<string, Handlebars.TemplateDelegate>();

let layoutRegistered = false;

function compile(file: string): Handlebars.TemplateDelegate {
  const cached = cache.get(file);
  if (cached) return cached;

  let source: string;
  try {
    source = readFileSync(join(TEMPLATE_DIR, file), "utf8");
  } catch (cause) {
    // Named, because the only realistic cause is a template missing from a built image, and a
    // generic ENOENT sends whoever reads it looking in the wrong place.
    throw new Error(`Email template not found: ${file} (looked in ${TEMPLATE_DIR})`, { cause });
  }

  const compiled = engine.compile(source, { strict: false, noEscape: false });
  cache.set(file, compiled);
  return compiled;
}

/** Renders one template inside the shared layout. Values are HTML-escaped by Handlebars. */
export function renderTemplate(name: TemplateName, data: Record<string, unknown>): string {
  if (!TEMPLATE_NAMES.includes(name)) {
    throw new Error(`Unknown email template: ${name}`);
  }

  if (!layoutRegistered) {
    // Registered rather than inlined per template, so the table scaffolding that keeps Outlook and
    // Gmail honest lives in exactly one file.
    engine.registerPartial("layout", compile("layout.hbs"));
    layoutRegistered = true;
  }

  return compile(`${name}.hbs`)(data);
}
