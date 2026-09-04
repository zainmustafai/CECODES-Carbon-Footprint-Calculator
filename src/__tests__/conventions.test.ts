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
