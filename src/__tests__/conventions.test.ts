import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Project conventions that a reviewer cannot reasonably police by eye.
//
// The em-dash ban was previously enforced only inside src/messages/*.json, so four em dashes
// walked straight into src/features/preview/ and the suite stayed green. A convention that is
// only checked in one file is not enforced, it is decorative. This walks the real tree.

// Written as an escape so that this file does not itself contain the character it bans, which
// would make the check flag its own source and fail forever.
const EM_DASH = "\u2014";

const GENERATED = join("src", "lib", "generated");

// The one deliberate exclusion, and not for style reasons. Prisma stores a checksum of every
// applied migration in _prisma_migrations, so editing a shipped migration, even inside a comment,
// makes `migrate deploy` refuse to run against every database that already applied it. One em
// dash lives in 20260709120320_rls_and_auth's header comment and has to stay exactly where it is.
const MIGRATIONS = join("prisma", "migrations");

// Config and manifest files that sit at the root and therefore belong to no walked directory.
// Listed by name rather than globbed, so adding one is a deliberate act.
const ROOT_FILES = [
  "prisma.config.ts",
  "playwright.config.ts",
  "next.config.ts",
  "vitest.config.ts",
  "eslint.config.mjs",
  "docker-compose.yml",
  "Dockerfile",
  "Caddyfile",
  ".env.example",
];

function walk(dir: string, match: (file: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (path.startsWith(GENERATED)) continue; // Prisma's output, not ours to style
    if (path.startsWith(MIGRATIONS)) continue; // checksummed, see above
    if (entry === "node_modules" || entry === ".next") continue;
    if (statSync(path).isDirectory()) out.push(...walk(path, match));
    else if (match(entry)) out.push(path);
  }
  return out;
}

describe("project conventions", () => {
  it("uses no em dash anywhere in the source tree", () => {
    const files = walk("src", (f) => /\.(ts|tsx|json)$/.test(f));

    const offenders = files
      .map((file) => ({ file, lines: offendingLines(file) }))
      .filter(({ lines }) => lines.length > 0);

    expect(offenders).toEqual([]);
  });

  it("uses no em dash in the project docs", () => {
    // The docs are the client-facing artifact; the ban matters most here.
    const files = [
      ...walk("docs", (f) => f.endsWith(".md")),
      ...readdirSync(".")
        .filter((f) => f.endsWith(".md"))
        .map((f) => f),
    ];

    const offenders = files
      .map((file) => ({ file, lines: offendingLines(file) }))
      .filter(({ lines }) => lines.length > 0);

    expect(offenders).toEqual([]);
  });

  it("uses no em dash in the rest of the first-party tree", () => {
    // The two checks above cover src/ and the docs, and prisma/seed-prod.ts still walked past
    // both of them for months, because it is neither. Its banner read "PROD SEED (em dash)
    // APPLYING" and every run printed the character this project bans.
    //
    // AGENTS.md says never, anywhere. A ban enforced over two of the four places we write code
    // does not enforce anything, it just relocates the blind spot, which is the exact lesson the
    // comment at the top of this file already records about src/messages. So this closes the
    // remaining first-party ground: the Prisma scripts, the operational scripts, the Playwright
    // suite, and the root config files that configure all of it.
    const files = [
      ...walk("prisma", (f) => /\.(ts|sql)$/.test(f)),
      ...walk("scripts", (f) => /\.(ts|sql)$/.test(f)),
      ...walk("e2e", (f) => /\.ts$/.test(f)),
      ...ROOT_FILES.filter((f) => existsSync(f)),
    ];

    const offenders = files
      .map((file) => ({ file, lines: offendingLines(file) }))
      .filter(({ lines }) => lines.length > 0);

    expect(offenders).toEqual([]);
  });
});

// Reports line numbers, not just a boolean, so a failure names the exact spot.
function offendingLines(file: string): number[] {
  const text = readFileSync(file, "utf8");
  if (!text.includes(EM_DASH)) return [];
  return text
    .split("\n")
    .map((line, index) => (line.includes(EM_DASH) ? index + 1 : 0))
    .filter((line) => line > 0);
}

// The pre-hydration form leak, and the two halves of the fix.
//
// Observed in production, not theorised: driving the login form landed the browser on
// /login?email=...%40gmail.com&password=... The password went into the query string, and from
// there into browser history and the CDN access log. The cause is that every form in this app
// is wired with onSubmit only, so the server-rendered markup is <form noValidate> with no
// method and no action. Before React hydrates there is no submit handler, so a submit is a
// NATIVE submit, and a form with no method defaults to GET against the current URL, which
// serialises every named field into the query string. Pressing Enter in a text field is enough
// to trigger it, and on a slow connection the unhydrated window lasts seconds.
//
// Half one, checked here: method="post" on every form that has an onSubmit. When the form is
// hydrated this changes nothing, because handleSubmit calls preventDefault. When it is not, the
// fields go in the request body instead of the URL, and a POST to a page route with no POST
// handler is a 405, which is a loud failure rather than a silent leak.
//
// Half two, also checked here: the submit button is disabled until the component has mounted
// (useHydrated in src/hooks/use-form-submit.ts). Per the HTML spec, implicit submission does
// nothing when the form's default button is disabled, so one disabled attribute closes both the
// click path and the Enter path. That wiring is per component and therefore the part most
// likely to be forgotten on the nineteenth form, which is exactly what a conventions test is for.
describe("forms cannot leak their fields into the URL", () => {
  it("declares method=post on every form that submits through onSubmit", () => {
    const offenders = formComponents().flatMap(({ file, text }) =>
      openingTags(text, "form")
        .filter((tag) => tag.text.includes("onSubmit") && !tag.text.includes('method="post"'))
        .map((tag) => ({ file, line: tag.line })),
    );

    expect(offenders).toEqual([]);
  });

  it("disables the submit button of every such form until it has hydrated", () => {
    // The `disabled` expression only has to mention `hydrated`, not equal `!hydrated`, so a form
    // whose button is also disabled on some other condition can compose the two.
    const offenders = formComponents()
      .filter(({ text }) => openingTags(text, "form").some((tag) => tag.text.includes("onSubmit")))
      .flatMap(({ file, text }) =>
        openingTags(text, "Button")
          .filter((tag) => tag.text.includes('type="submit"'))
          .filter((tag) => !/disabled=\{[^}]*hydrated/.test(tag.text))
          .map((tag) => ({ file, line: tag.line })),
      );

    expect(offenders).toEqual([]);
  });
});

function formComponents(): { file: string; text: string }[] {
  return walk("src", (f) => f.endsWith(".tsx")).map((file) => ({
    file,
    text: readFileSync(file, "utf8"),
  }));
}

// Every opening tag of `name` with the line it starts on, so a failure names the exact spot the
// way the em-dash check does. The tag ends at the first ">" that is not inside a JSX expression
// container, which is enough for the attribute lists this codebase writes and does not need a
// parser dependency to be right about them.
function openingTags(text: string, name: string): { text: string; line: number }[] {
  const tags: { text: string; line: number }[] = [];
  // The lookahead is what stops <formatted> matching <form>: the tag name has to end here.
  const opener = new RegExp(`<${name}(?=[^A-Za-z0-9])`, "g");
  for (const match of text.matchAll(opener)) {
    const start = match.index;
    let depth = 0;
    let end = start;
    while (end < text.length) {
      const char = text[end];
      if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      else if (char === ">" && depth === 0) break;
      end += 1;
    }
    tags.push({
      text: text.slice(start, end + 1),
      line: text.slice(0, start).split("\n").length,
    });
  }
  return tags;
}
