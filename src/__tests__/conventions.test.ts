import { readFileSync, readdirSync, statSync } from "node:fs";
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

function walk(dir: string, match: (file: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (path.startsWith(GENERATED)) continue; // Prisma's output, not ours to style
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
