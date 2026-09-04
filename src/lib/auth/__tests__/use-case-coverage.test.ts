import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The gate that turns "100% of auth use cases are covered" from a claim into a build failure.
//
// It proves a registered case was considered and exercised by a test that actually runs. It does
// NOT prove the assertion behind it is strong; that is what review is for. The pairing is
// checkable because each id sits in a test name next to the assertion it describes.
//
// Three things are load-bearing, and each is enforced here rather than promised in prose:
//
// 1. "Sits in a test name." An id counts only when it appears inside the literal title argument of
//    an it(...)/test(...) call. An id that shows up only in a comment, a docblock, or anywhere
//    else in a file's prose counts in neither direction, because a comment is never checked by
//    anything and would let this gate be satisfied by prose alone. extractTitles is what enforces
//    that scope; it is deliberately not a whole-file regex.
//
// 2. "A test that runs." "Covered" has to imply "executed" or the whole artifact is theatre.
//    it.skip("AUTH-42 ..."), it.todo("AUTH-42 ..."), and a plain it() nested inside a
//    describe.skip() each put an id next to something that never executes, and each used to
//    satisfy this gate. Now a title carrying any modifier outside RUNS_ANYWAY is disqualified, as
//    is any title inside a disqualified describe(), and a disqualified title naming an AUTH id is
//    itself a failure rather than merely a non-credit. .only is disqualified too, even though it
//    does execute: one committed .only silences every other test in its file, which would leave
//    this gate crediting ids whose tests had quietly stopped running. Vitest refuses .only in CI
//    anyway, and it is a debugging aid that is never meant to be committed, so nothing legitimate
//    pays for that.
//
// 3. A token that is shaped like an id but is not one is not silently dropped. collectIds throws,
//    naming the offending token and the file it was found in, for AUTH-5, AUTH-100, AUTH-42x,
//    AUTH_42 and auth-42 alike: the rule is AUTH, a hyphen, exactly two digits, that casing. What
//    it deliberately does NOT catch is a token with no digit at all after the separator, because
//    AUTH_PAGES and auth-actions.ts are ordinary identifiers that appear in this codebase and are
//    not typos of anything. A typo that keeps the digits is the one that would silently stop
//    tracking a real case, and that is the one this refuses to let past.

const REGISTER = "docs/auth/USE-CASES.md";

// Modifiers that leave an it()/test()/describe() running exactly as if they were not written.
// Anything else disqualifies the title. Fail-closed on purpose: an unrecognised modifier means
// this gate cannot tell whether the test runs, so it declines to credit it rather than assuming.
const RUNS_ANYWAY = new Set(["each", "for", "concurrent", "sequential", "extend"]);

// Modifiers that take their own parenthesised argument list before the title call. Their arguments
// must be stepped over, or the condition/table would be mistaken for the title argument.
const TAKES_ARGUMENTS = new Set(["each", "for", "skipIf", "runIf", "extend"]);

const EXPLAIN: Record<string, string> = {
  skip: "never executes",
  todo: "has no body to execute",
  only: "runs but silences every other test in its file, so ids credited elsewhere could quietly stop running",
  skipIf: "executes only when a condition holds",
  runIf: "executes only when a condition holds",
  failing: "is asserted to fail rather than to hold",
};

function explain(modifier: string): string {
  return (
    EXPLAIN[modifier] ?? "is not a modifier this gate recognises as leaving a test running"
  );
}

function walk(dir: string, match: (file: string) => boolean, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    // node_modules and build output hold no tests and make this walk take seconds.
    if (entry === "node_modules" || entry === ".next" || entry === "generated") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, match, out);
    else if (match(entry)) out.push(full);
  }
  return out;
}

// Advances past a balanced (...) group whose opening paren is at `open`, returning the index right
// after its matching close paren. Needed for a `.each(...)` argument list, which can itself contain
// parens (a function call, a tuple) that must not be mistaken for the end of the group, and for the
// body of a disqualified describe(). A string literal inside is skipped whole, backslash escapes
// and all, so a stray `)` or quote inside one never desyncs the depth count. An unbalanced paren
// inside a comment or a regex literal still can; that would misjudge where a skipped describe ends,
// which is the reason the per-title modifier check above is the primary defence and this is the
// secondary one.
function skipBalancedParens(content: string, open: number): number {
  let depth = 0;
  let i = open;
  for (; i < content.length; i++) {
    const c = content[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return i + 1;
    } else if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < content.length && content[i] !== quote) {
        if (content[i] === "\\") i++;
        i++;
      }
    }
  }
  return i;
}

/**
 * Walks the `.each(...)/.skip/.only/.concurrent` chain that may follow an `it`/`test`/`describe`
 * token, in any combination, and reports where the chain ends plus the first modifier (if any)
 * that stops the call running unconditionally.
 */
function walkModifiers(
  content: string,
  from: number,
  scope: string,
): { index: number; disqualifier: string | null } {
  let i = from;
  let disqualifier: string | null = null;
  while (content[i] === ".") {
    const ident = /^[a-zA-Z]+/.exec(content.slice(i + 1));
    if (!ident) break;
    const modifier = ident[0];
    i += 1 + modifier.length;
    if (!RUNS_ANYWAY.has(modifier) && !disqualifier) {
      disqualifier = `.${modifier} on ${scope}, which ${explain(modifier)}`;
    }
    if (TAKES_ARGUMENTS.has(modifier)) {
      while (content[i] === " " || content[i] === "\t") i++;
      if (content[i] === "(") i = skipBalancedParens(content, i);
    }
  }
  return { index: i, disqualifier };
}

/** The span of every `describe(...)`/`suite(...)` call whose own modifiers stop it running. */
function disqualifiedBlocks(content: string): { start: number; end: number; why: string }[] {
  const blocks: { start: number; end: number; why: string }[] = [];
  const head = /\b(?:describe|suite)\b/g;
  while (head.exec(content) !== null) {
    const { index, disqualifier } = walkModifiers(content, head.lastIndex, "an enclosing describe()");
    let i = index;
    while (content[i] === " " || content[i] === "\t") i++;
    if (content[i] !== "(") continue; // the word "describe" in prose, not a call
    if (!disqualifier) continue;
    blocks.push({ start: i, end: skipBalancedParens(content, i), why: disqualifier });
  }
  return blocks;
}

type Occurrence = { title: string; disqualifier: string | null };

// Finds every it(...)/test(...) call in `content`, including a .each(...) argument list and any
// modifier chain, and returns the literal text of each call's title argument (its first argument,
// single-quoted, double-quoted, or a template literal) alongside the reason, if there is one, that
// the test behind it does not run unconditionally. This is the name-scoping the register's own
// preamble promises: an id counts only when it sits inside one of these strings, and only when the
// test wearing that string actually runs.
function extractTitles(content: string): Occurrence[] {
  const blocks = disqualifiedBlocks(content);
  const titles: Occurrence[] = [];
  const head = /\b(?:it|test)\b/g;
  let m: RegExpExecArray | null;
  while ((m = head.exec(content))) {
    const start = m.index;
    const { index, disqualifier } = walkModifiers(content, head.lastIndex, "the test itself");
    let i = index;
    while (content[i] === " " || content[i] === "\t") i++;
    if (content[i] !== "(") continue; // "it"/"test" used as an ordinary word, not a call
    i++;
    while (content[i] === " " || content[i] === "\t" || content[i] === "\n") i++;
    const quote = content[i];
    if (quote !== '"' && quote !== "'" && quote !== "`") continue; // first arg isn't a literal
    let j = i + 1;
    let title = "";
    while (j < content.length && content[j] !== quote) {
      if (content[j] === "\\") {
        title += content[j + 1];
        j += 2;
        continue;
      }
      title += content[j];
      j++;
    }
    const enclosing = blocks.find((b) => start > b.start && start < b.end);
    titles.push({ title, disqualifier: disqualifier ?? enclosing?.why ?? null });
    head.lastIndex = j; // never rescan inside a title we already captured
  }
  return titles;
}

// Collects every AUTH-NN id in `text`, throwing loudly if a token is id-shaped (AUTH, a separator,
// then a digit) but is not exactly `AUTH-` followed by two digits, naming the malformed token and
// `source` (the file it lives in).
function collectIds(text: string, source: string): Set<string> {
  const ids = new Set<string>();
  const pattern = /\bAUTH[-_](\d[A-Za-z0-9_]*)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const token = match[0];
    const digits = match[1];
    if (token !== `AUTH-${digits}` || !/^\d{2}$/.test(digits)) {
      throw new Error(
        `Malformed use-case id "${token}" in ${source}: an id is AUTH, a hyphen, and exactly ` +
          `two digits, in that casing (e.g. AUTH-07).`,
      );
    }
    ids.add(`AUTH-${digits}`);
  }
  return ids;
}

function readRegisteredIds(): Set<string> {
  return collectIds(readFileSync(REGISTER, "utf8"), REGISTER);
}

function testFiles(): string[] {
  return [
    ...walk("src", (f) => f.endsWith(".test.ts")),
    ...walk("e2e", (f) => f.endsWith(".spec.ts")),
  ].filter((f) => !f.endsWith("use-case-coverage.test.ts"));
}

type Naming = { id: string; file: string; title: string; disqualifier: string | null };

function readNamings(files: string[]): Naming[] {
  const namings: Naming[] = [];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const { title, disqualifier } of extractTitles(content)) {
      for (const id of collectIds(title, `${file} (title "${title}")`)) {
        namings.push({ id, file, title, disqualifier });
      }
    }
  }
  return namings;
}

describe("auth use-case coverage", () => {
  it("every registered case is named by at least one test that runs", () => {
    const registered = readRegisteredIds();
    expect(registered.size).toBeGreaterThan(0);

    const covered = new Set(readNamings(testFiles()).filter((n) => !n.disqualifier).map((n) => n.id));

    const missing = [...registered].filter((id) => !covered.has(id)).sort();
    expect(
      missing,
      `Registered in ${REGISTER} but named by no running test's own it()/test() title`,
    ).toEqual([]);
  });

  it("every id named by a test is registered", () => {
    // The other direction, so a renamed case cannot leave an orphan test claiming coverage of an
    // id that no longer describes anything. Deliberately counts disqualified titles too: an id
    // stranded inside a skipped test is exactly the stale attribution this is here to surface.
    const registered = readRegisteredIds();
    const named = new Set(readNamings(testFiles()).map((n) => n.id));

    const orphans = [...named].filter((id) => !registered.has(id)).sort();
    expect(orphans, `Named by a test's title but absent from ${REGISTER}`).toEqual([]);
  });

  it("no id is attached to a test that does not run unconditionally", () => {
    // Without this, "covered" means "mentioned" rather than "executed": it.skip, it.todo, and an
    // it() inside a describe.skip() all satisfy a name-scoped gate while proving nothing. The rule
    // is flat rather than conditional (an id may not appear in such a title even when a running
    // test also names it), because "this id is fine, it is covered somewhere else" is precisely the
    // reasoning that lets an attribution rot unnoticed.
    const parked = readNamings(testFiles())
      .filter((n) => n.disqualifier)
      .map((n) => `${n.id} in ${n.file}: "${n.title}" carries ${n.disqualifier}`)
      .sort();

    expect(
      parked,
      "An AUTH id may only sit on a test that runs; move the id or make the test run",
    ).toEqual([]);
  });
});
