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

// An isolated environment, not the shared module singleton. registerHelper/registerPartial land
// only on this `engine` (confirmed against the installed handlebars@4.7.9: two `create()`
// results have distinct `helpers`/`partials` objects). `Utils` is NOT isolated the same way:
// `create()` assigns `Utils` from one module-scope object shared by every environment, so
// `engine.Utils === Handlebars.Utils`. An earlier version of this file mutated
// `engine.Utils.escapeExpression`, believing that was scoped to `engine`; it was not, and it
// silently rewrote HTML escaping for the process-wide default `Handlebars` export too, for the
// life of the server, the moment this module was imported. Nothing here touches `Utils` for that
// reason. render.test.ts's "does not weaken the shared Handlebars singleton" test is the
// regression guard: it imports this module, then compiles a template with the default export and
// asserts "=" still comes out as "&#x3D;".
const engine = Handlebars.create();

// Handlebars' default {{ }} escaping HTML-encodes seven characters: & < > " ' ` and =, and that
// full strength is exactly right for every ordinary value these templates render - title, expiry,
// name, email, changedAt all keep the default, including its defence against an unquoted
// attribute. The one place the default is actively wrong is a URL: our reset and set-password
// links are themselves query strings like "?token=abc", so the default escaper turns every
// emailed href into "...&#x3D;abc". That is valid HTML and a compliant client decodes it, but
// email clients are some of the least compliant renderers that exist, and a link an inbox fails
// to decode is a user who cannot reset their password. Deliverability of a link this app already
// builds and controls beats defending against an injection vector these templates do not expose
// for that one value, so the `url` helper below narrows escaping to the five standard entities
// (still escaped, just not encoded further) for URL values only, nowhere else, and only ever
// behind a double-stache inside a quoted attribute or as ordinary text; render.test.ts's "guards
// unquoted attributes" test enforces the quoting half of that.
const URL_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};
const HAS_ESCAPABLE_CHAR = /[&<>"']/;
const ESCAPABLE_CHARS = /[&<>"']/g;

function escapeUrl(value: unknown): string {
  if (value == null) return "";
  const str = String(value);
  if (!HAS_ESCAPABLE_CHAR.test(str)) return str;
  return str.replace(ESCAPABLE_CHARS, (char) => URL_ESCAPE[char]!);
}

// A SafeString is Handlebars' own "already escaped, do not touch again" marker, recognised by
// `{{ }}` via the `.toHTML()` duck-type it exposes. Wrapping escapeUrl's output in one is what
// lets `{{url resetUrl}}` stay a double-stache: without the wrapper, Handlebars would run its own
// (stronger) escaping over an already-escaped string. Registered as a helper on `engine`, not a
// mutation of anything shared, so isolation holds for real this time.
engine.registerHelper("url", (value: unknown) => new engine.SafeString(escapeUrl(value)));

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
