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
// fields travel in the request body instead of the URL, which is what closes the leak.
//
// What half one does NOT do, though this comment asserted it for a while: make the stray submit
// visible. The claim was that a POST to a page route with no POST handler is a 405, "a loud
// failure rather than a silent leak". Checked against the installed Next (16.2.10) rather than
// taken from memory, that is false. A native form POST carries content-type
// application/x-www-form-urlencoded; server/lib/server-action-request-meta.js counts any
// urlencoded POST as a possible Server Action, and that flag is precisely what skips the 405
// branch in server/base-server.js. server/app-render/action-handler.js then declines the
// request, because urlencoded actions are not supported, and for a non-fetch request it declines
// by returning null, which means "carry on rendering the page". Next says why in its own comment
// there: "to prevent changes in behavior when a regular page component tries to handle a POST".
// The user gets a 200 and the page back with their input silently dropped. So half two is not a
// nicety layered on top of a loud failure. It is the only half that stops the submit happening.
//
// Half two, also checked here: the submit button is disabled until the component has mounted
// (useHydrated in src/hooks/use-form-submit.ts). Per the HTML spec, implicit submission does
// nothing when the form's default button is disabled, so one disabled attribute closes both the
// click path and the Enter path. That wiring is per component and therefore the part most
// likely to be forgotten on the nineteenth form, which is exactly what a conventions test is for.
//
// The checks below used to be one, and it only ever matched `<Button type="submit"` in the same
// file as the form, case sensitively. Four ways past it, all of them things this codebase either
// already writes or could write tomorrow: a lowercase `<button type="submit">` (see
// src/components/form/password-field.tsx for the lowercase habit), a `<Button type={"submit"}>`,
// a bare `<Button>` inside a form, which HTML treats as a submit button because the type
// attribute defaults to submit, and a submit button lifted into a shared component, which leaves
// the form file with nothing for a file-scoped check to find. Each of those passed silently,
// which is the one thing a guard must never do.

// Both spellings of a button: the shadcn wrapper and the plain element. Two patterns rather than
// one case-insensitive pattern, because <Button> and <button> are different components and a
// failure should name the one that is really there.
function buttonTags(text: string): Tag[] {
  return [...openingTags(text, "Button"), ...openingTags(text, "button")];
}

// type="submit", type='submit' and type={"submit"} are the same button to a browser. The leading
// whitespace is what stops data-type="submit" and friends from matching: JSX separates attributes
// with whitespace, so a real attribute always has some in front of it.
const SUBMIT_TYPE = /\stype\s*=\s*(?:["']submit["']|\{\s*["']submit["']\s*\})/;

// The only way out of the inside-a-form check below: say, in a literal the scanner can read, that
// this button is not a submit button. Everything else counts as one, including no type attribute
// at all (HTML's default is submit) and a computed type={...}. That last case is not
// hypothetical here: company-wizard-dialog.tsx carries a comment about a bug it already had,
// where one reused button node flipped its own type between steps.
const NON_SUBMIT_TYPE = /\stype\s*=\s*(?:["'](?:button|reset)["']|\{\s*["'](?:button|reset)["']\s*\})/;

// The `disabled` expression only has to mention `hydrated`, not equal `!hydrated`, so a button
// that is also disabled on some other condition can compose the two.
const GATED = /disabled=\{[^}]*hydrated/;

describe("forms cannot leak their fields into the URL", () => {
  it("declares method=post on every form that submits through onSubmit", () => {
    const offenders = tsxFiles().flatMap(({ file, text }) =>
      openingTags(text, "form")
        .filter((tag) => tag.text.includes("onSubmit") && !tag.text.includes('method="post"'))
        .map((tag) => ({ file, line: tag.line })),
    );

    expect(offenders).toEqual([]);
  });

  it("gates every button that says type=submit, anywhere in src", () => {
    // Deliberately not scoped to files that contain a <form>. A submit button does not have to
    // live in the same file as its form: extract one into a shared component and a file-scoped
    // check goes quiet while the button it stopped watching is still the default button of every
    // form that renders it. A tag that spells out type="submit" carries the gate wherever it is.
    const offenders = tsxFiles().flatMap(({ file, text }) =>
      buttonTags(text)
        .filter((tag) => SUBMIT_TYPE.test(tag.text))
        .filter((tag) => !GATED.test(tag.text))
        .map((tag) => ({ file, line: tag.line })),
    );

    expect(offenders).toEqual([]);
  });

  it("gates every button inside an onSubmit form that does not opt out with an explicit type", () => {
    // The HTML default is the trap: a <Button> with no type attribute, sitting inside a form, is
    // that form's submit button and its default button. So inside a form the rule inverts. A
    // button is exempt only if it says it is not a submit button; silence is not an exemption.
    const offenders = tsxFiles().flatMap(({ file, text }) =>
      submitFormSpans(text).flatMap(({ span, offset }) =>
        buttonTags(span)
          // asChild is the one real exemption. Radix's Slot renders the CHILD element with the
          // Button's props merged into it, so <Button asChild><Link/></Button> puts an anchor in
          // the DOM and no button at all, and an anchor cannot submit a form. Narrow on purpose:
          // a <button> written as that child would still be one, and nothing here does that.
          .filter((tag) => !/\basChild\b/.test(tag.text))
          .filter((tag) => !NON_SUBMIT_TYPE.test(tag.text))
          .filter((tag) => !GATED.test(tag.text))
          .map((tag) => ({ file, line: lineOf(text, offset + tag.start) })),
      ),
    );

    expect(offenders).toEqual([]);
  });

  it("names every onSubmit form that has no submit button of its own", () => {
    // This one exists so that a form the checks above cannot speak for gets reported rather than
    // passed over. A form with no submit button is not covered by the disabled-button rule, since
    // there is no button to disable. It is covered, if at all, by a narrower clause of the HTML
    // spec: with no submit button, implicit submission does nothing only when the form has MORE
    // THAN ONE field that blocks it. A form with no submit button and exactly one text field
    // still submits natively when the user presses Enter in that field.
    //
    // The expected list is empty on purpose. Today every onSubmit form in the tree writes a
    // submit button out in full, and adding one that does not should stop here and make someone
    // count the fields.
    //
    // company-wizard-dialog.tsx is the near miss worth naming, and the reason this check reads
    // "of its own" rather than "in every state". Its form does contain a submit button, gated, so
    // it satisfies every check above and does not appear here. But that button is rendered only
    // on the last step (`isLastStep ? <Button type="submit"> : <Button type="button">`), so on
    // steps 0 to 2 the live page has no submit button at all, and step 2 renders a single text
    // field, which is exactly the one-field case above. A lexical scan cannot evaluate
    // `isLastStep`, so nothing in this file is evidence that the wizard is safe on those steps.
    // What makes it safe is something no check here looks at: the wizard lives in a dialog, and a
    // dialog opens from a click handler, which cannot run until React has hydrated, so the
    // unhydrated window the leak needs never exists for it. Written down rather than assumed,
    // because the next reader of a green suite would otherwise take it for covered.
    const missing = tsxFiles().flatMap(({ file, text }) =>
      submitFormSpans(text)
        .filter(({ span }) =>
          buttonTags(span)
            .filter((tag) => !/\basChild\b/.test(tag.text))
            .every((tag) => NON_SUBMIT_TYPE.test(tag.text)),
        )
        .map(({ line }) => ({ file, line })),
    );

    expect(missing).toEqual([]);
  });
});

function tsxFiles(): { file: string; text: string }[] {
  return walk("src", (f) => f.endsWith(".tsx")).map((file) => ({
    file,
    text: readFileSync(file, "utf8"),
  }));
}

// Every <form onSubmit> in a file, as the source between its opening tag and its closing one.
// Forms cannot nest in HTML, so the first </form> after the opening tag is the matching one, and
// that is enough to tell a button inside this form from one elsewhere in the same file. A span
// that never closes (a self-closing <form />, or JSX this scanner has misread) runs to the end of
// the file, which over-reports rather than under-reports, the right way round for a guard.
function submitFormSpans(text: string): { span: string; offset: number; line: number }[] {
  return openingTags(text, "form")
    .filter((tag) => tag.text.includes("onSubmit"))
    .map((tag) => {
      const close = text.indexOf("</form>", tag.end);
      return {
        span: text.slice(tag.start, close === -1 ? text.length : close),
        offset: tag.start,
        line: tag.line,
      };
    });
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

type Tag = { text: string; line: number; start: number; end: number };

// Every opening tag of `name` with the line it starts on, so a failure names the exact spot the
// way the em-dash check does. The tag ends at the first ">" that is not inside a JSX expression
// container, which is enough for the attribute lists this codebase writes and does not need a
// parser dependency to be right about them. start and end are the offsets of that range, so a
// caller can slice the element's own contents out of the same source.
function openingTags(text: string, name: string): Tag[] {
  const tags: Tag[] = [];
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
      line: lineOf(text, start),
      start,
      end,
    });
  }
  return tags;
}
