import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The gate that turns "100% of auth use cases are covered" from a claim into a build failure.
//
// It proves a registered case was considered and exercised. It does NOT prove the assertion behind
// it is strong; that is what review is for. The pairing is checkable because each id sits in a test
// name next to the assertion it describes.

const REGISTER = "docs/auth/USE-CASES.md";
const ID = /\bAUTH-\d{2}\b/g;

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

describe("auth use-case coverage", () => {
  it("every registered case is named by at least one test", () => {
    const registered = new Set(readFileSync(REGISTER, "utf8").match(ID) ?? []);
    expect(registered.size).toBeGreaterThan(0);

    const files = [
      ...walk("src", (f) => f.endsWith(".test.ts")),
      ...walk("e2e", (f) => f.endsWith(".spec.ts")),
    ].filter((f) => !f.endsWith("use-case-coverage.test.ts"));

    const covered = new Set<string>();
    for (const file of files) {
      for (const id of readFileSync(file, "utf8").match(ID) ?? []) covered.add(id);
    }

    const missing = [...registered].filter((id) => !covered.has(id)).sort();
    expect(missing, `Registered in ${REGISTER} but named by no test`).toEqual([]);
  });

  it("every id named by a test is registered", () => {
    // The other direction, so a renamed case cannot leave an orphan test claiming coverage of an
    // id that no longer describes anything.
    const registered = new Set(readFileSync(REGISTER, "utf8").match(ID) ?? []);
    const files = [
      ...walk("src", (f) => f.endsWith(".test.ts")),
      ...walk("e2e", (f) => f.endsWith(".spec.ts")),
    ].filter((f) => !f.endsWith("use-case-coverage.test.ts"));

    const orphans = new Set<string>();
    for (const file of files) {
      for (const id of readFileSync(file, "utf8").match(ID) ?? []) {
        if (!registered.has(id)) orphans.add(id);
      }
    }

    expect([...orphans].sort(), `Named by a test but absent from ${REGISTER}`).toEqual([]);
  });
});
