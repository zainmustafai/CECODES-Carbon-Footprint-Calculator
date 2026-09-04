import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The gate that turns "100% of auth use cases are covered" from a claim into a build failure.
//
// It proves a registered case was considered and exercised. It does NOT prove the assertion behind
// it is strong; that is what review is for. The pairing is checkable because each id sits in a test
// name next to the assertion it describes.
//
// "Sits in a test name" is load-bearing, not decorative: an id only counts when it appears inside
// the literal title argument of an it(...)/test(...) call (including an it.each(...)(...)/
// test.each(...)(...) call, and a .skip/.only/.concurrent modifier on either). An id that shows up
// only in a comment, a docblock, or anywhere else in the file's prose does not count in either
// direction, because a comment is never checked by anything and would let this gate be satisfied by
// prose alone. extractTitles below is what enforces that scope; it is deliberately not a whole-file
// regex.
//
// A token that merely looks like an id, AUTH-5 or AUTH-100 for instance, is not silently dropped
// either. collectIds requires exactly two digits after the hyphen and throws, naming the offending
// token and the file it was found in, when that is not what it sees. A typo in an id is a case that
// silently stops being tracked; this gate refuses to let that happen without saying so.

const REGISTER = "docs/auth/USE-CASES.md";

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
// parens (a function call, a tuple) that must not be mistaken for the end of the group. A string
// literal inside is skipped whole, backslash escapes and all, so a stray `)` or quote inside one
// never desyncs the depth count.
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

// Finds every it(...)/test(...) call in `content`, including a .each(...) argument list and a
// .skip/.only/.concurrent modifier in any combination, and returns the literal text of each call's
// title argument (its first argument, single-quoted, double-quoted, or a template literal). This is
// the name-scoping the register's own preamble promises: an id counts only when it sits inside one
// of these strings.
function extractTitles(content: string): string[] {
  const titles: string[] = [];
  const head = /\b(?:it|test)\b/g;
  let m: RegExpExecArray | null;
  while ((m = head.exec(content))) {
    let i = head.lastIndex;
    // Walk a modifier chain: .each(...), .skip, .only, .concurrent, in any combination.
    while (content[i] === ".") {
      const ident = /^[a-zA-Z]+/.exec(content.slice(i + 1));
      if (!ident) break;
      i += 1 + ident[0].length;
      if (ident[0] === "each") {
        while (content[i] === " " || content[i] === "\t") i++;
        if (content[i] === "(") i = skipBalancedParens(content, i);
      }
    }
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
    titles.push(title);
    head.lastIndex = j; // never rescan inside a title we already captured
  }
  return titles;
}

// Collects every AUTH-NN id in `text`, throwing loudly if a token matches AUTH-<digits> but the
// digit run is not exactly two long, naming the malformed token and `source` (the file it lives in).
function collectIds(text: string, source: string): Set<string> {
  const ids = new Set<string>();
  const pattern = /\bAUTH-(\d+)\b/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const digits = match[1];
    if (digits.length !== 2) {
      throw new Error(
        `Malformed use-case id "AUTH-${digits}" in ${source}: an id must be exactly two digits ` +
          `(e.g. AUTH-07), not ${digits.length}.`,
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

function readCoveredIds(files: string[]): Set<string> {
  const covered = new Set<string>();
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const title of extractTitles(content)) {
      for (const id of collectIds(title, `${file} (title "${title}")`)) covered.add(id);
    }
  }
  return covered;
}

describe("auth use-case coverage", () => {
  it("every registered case is named by at least one test", () => {
    const registered = readRegisteredIds();
    expect(registered.size).toBeGreaterThan(0);

    const covered = readCoveredIds(testFiles());

    const missing = [...registered].filter((id) => !covered.has(id)).sort();
    expect(missing, `Registered in ${REGISTER} but named by no test's own it()/test() title`).toEqual([]);
  });

  it("every id named by a test is registered", () => {
    // The other direction, so a renamed case cannot leave an orphan test claiming coverage of an
    // id that no longer describes anything.
    const registered = readRegisteredIds();
    const covered = readCoveredIds(testFiles());

    const orphans = [...covered].filter((id) => !registered.has(id)).sort();
    expect(orphans, `Named by a test's title but absent from ${REGISTER}`).toEqual([]);
  });
});
