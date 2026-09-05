import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { datasourceUrl } from "../datasource";

// The hole this file stands guard over.
//
// prisma.config.ts protects the Prisma CLI and anything the CLI spawns. Every script invoked
// DIRECTLY (`bun run db:seed`, `bun scripts/init-db.ts`, `bun prisma/import-factors.ts`, the
// Playwright fixture) never loads prisma.config.ts at all, and each of them used to resolve the
// datasource for itself with `process.env.DIRECT_URL ?? process.env.DATABASE_URL`. Bun auto-loads
// .env.local and fills in only the variables the shell left unset, so a developer who exported
// DATABASE_URL alone to name a throwaway container inherited .env.local's DIRECT_URL, which names
// the shared production database, and `??` preferred exactly that survivor. That is how
// `DATABASE_URL=<throwaway> bun run db:seed` wrote to production, and with ADMIN_PASSWORD set it
// rewrote the production admin's password and destroyed their sessions.
//
// Two things are checked here, and it is worth being exact about which is which:
//
//   1. BEHAVIOUR of the shared resolution path (scripts/datasource.ts), driven with fabricated
//      environments. This is the decision every one of those scripts now makes, so a regression
//      in it is a regression at all of them at once. It is not a test of any individual script's
//      own control flow, and no database is opened anywhere in this file.
//   2. ADOPTION, as a standing audit over the source: no file under prisma/, scripts/ or e2e/ may
//      read DATABASE_URL or DIRECT_URL out of process.env for itself again, and package.json may
//      not smuggle one back into an inline `bun -e` script. Check 1 is worthless at a call site
//      that quietly stops using the helper, and that is precisely how this bug got in: the
//      expression was correct in one place and copied into fifteen others.
//
// What is NOT covered: no test here starts a real `bun prisma/seed.ts`, so nothing proves the
// process-level integration end to end. Doing that honestly would need a live Postgres, which is
// the one thing a test of this bug must never reach for.

// Stand-ins, matching src/lib/__tests__/env-precedence.test.ts so the two read as one story. The
// production host is the shape .env.local holds on a maintainer's machine; the throwaway is the
// local container docs/DATA-MIGRATION.md and scripts/verify-fresh-db.ts tell you to export.
const PRODUCTION = "postgresql://app:secret@aws-1-us-west-2.pooler.supabase.com:5432/postgres";
const THROWAWAY = "postgresql://postgres:verify@127.0.0.1:55432/postgres";
const CONTAINER = "postgresql://cecodes:cecodes-local-dev@db:5432/cecodes";

describe("datasourceUrl, the decision every standalone script now makes", () => {
  it("keeps `DATABASE_URL=<throwaway> bun run db:seed` off the production DIRECT_URL", () => {
    // The reported bug, in the shape a script sees it when the env file half arrives from
    // @next/env: several of these scripts call loadEnvConfig(process.cwd()) in their module body,
    // and ESM evaluates scripts/datasource.ts (and therefore its snapshot) first, so .env.local's
    // DIRECT_URL is correctly absent from the snapshot and present in the environment.
    const snapshot = { DATABASE_URL: THROWAWAY };
    const env: Record<string, string | undefined> = {
      DATABASE_URL: THROWAWAY,
      DIRECT_URL: PRODUCTION,
    };

    const url = datasourceUrl(env, snapshot);

    // `process.env.DIRECT_URL ?? process.env.DATABASE_URL` returns PRODUCTION here. That is the
    // whole bug, and this line is the assertion that fails if anyone puts it back.
    expect(url).toBe(THROWAWAY);
    expect(url).not.toBe(PRODUCTION);
    // And the pair is normalised, so the `bun prisma/seed.ts` that init-db.ts and seed-prod.ts
    // spawn cannot re-resolve its way back to production either.
    expect(env.DIRECT_URL).toBe(THROWAWAY);
    expect(env.DATABASE_URL).toBe(THROWAWAY);
  });

  it("refuses to guess once bun has already merged .env.local into the environment", () => {
    // The same command, in the shape bun actually hands it over: bun loads .env.local before any
    // module of ours is evaluated and fills in the half the shell left unset, so the snapshot
    // cannot tell the exported half from the file-supplied one. A disagreement about the host is
    // the only signal left, and the answer is to stop rather than pick one.
    const snapshot = { DATABASE_URL: THROWAWAY, DIRECT_URL: PRODUCTION };
    const env: Record<string, string | undefined> = { ...snapshot };

    expect(() => datasourceUrl(env, snapshot)).toThrowError(/must name one database/);
    // Never the credentials: this message is printed by a CLI and pasted into chat windows.
    expect(() => datasourceUrl(env, snapshot)).not.toThrowError(/secret|verify/);
  });

  it("resolves silently when both halves name one host, which is the init container", () => {
    // docker-compose.yml sets DATABASE_URL and DIRECT_URL for the `init` service from the same
    // interpolation, so inside the container they are the same string on the same host. This is
    // the case that must stay boring: if it ever throws or returns undefined, `docker compose up
    // -d` stops initializing the database and the app container never starts.
    const snapshot = { DATABASE_URL: CONTAINER, DIRECT_URL: CONTAINER };
    const env: Record<string, string | undefined> = { ...snapshot };

    const url = datasourceUrl(env, snapshot);

    expect(url).toBe(CONTAINER);
    expect(env.DATABASE_URL).toBe(CONTAINER);
    expect(env.DIRECT_URL).toBe(CONTAINER);
  });

  it("returns undefined rather than throwing when nothing names a database", () => {
    // Each caller owns its own failure message (init-db.ts exits 1 through its [init] logger,
    // the fixture throws, the adapter callers let Prisma report it), so absence is reported, not
    // decided, here.
    expect(datasourceUrl({}, {})).toBeUndefined();
  });
});

// ------------------------------------------------------------------------------------------
// Standing audit: every direct-invocation call site actually goes through the helper.
// ------------------------------------------------------------------------------------------

// The three first-party trees whose files are run directly by bun or by Playwright, and therefore
// never see prisma.config.ts. src/ is deliberately absent: src/lib/prisma.ts is the application's
// own client and reads DATABASE_URL alone, with no DIRECT_URL preference to invert.
const SCRIPT_DIRS = ["prisma", "scripts", "e2e"];

// Any read of either datasource variable straight out of the environment. Written to catch the
// dotted and the bracketed spelling, because the second is what someone reaches for when the
// first has been forbidden.
const RAW_DATASOURCE_READ =
  /process\.env(?:\.(?:DATABASE_URL|DIRECT_URL)\b|\[\s*["'`](?:DATABASE_URL|DIRECT_URL)["'`]\s*\])/;

// Every file that resolves a connection string for itself. Listed rather than globbed so that
// deleting the import from one of them fails here instead of passing quietly.
const CALL_SITES = [
  join("scripts", "init-db.ts"),
  join("scripts", "bootstrap-db.ts"),
  join("scripts", "verify-fresh-db.ts"),
  join("scripts", "audit-password-hashes.ts"),
  join("prisma", "seed.ts"),
  join("prisma", "seed-prod.ts"),
  join("prisma", "seed-demo.ts"),
  join("prisma", "import-factors.ts"),
  join("prisma", "backfill-auth-credentials.ts"),
  join("prisma", "fix-2026-08-15-client-feedback.ts"),
  join("prisma", "fix-2026-08-15-refrigerant-duplicate-regression.ts"),
  join("prisma", "fix-2026-08-15-scope3-entry-modes-demo-data.ts"),
  join("prisma", "fix-2026-08-24-scope2-sin-rename.ts"),
  join("prisma", "reapply-2026-09-03-factor-correction.ts"),
  join("prisma", "repoint-renamed-factors.ts"),
  join("prisma", "fix-travel-factors.ts"),
  join("e2e", "fixture.ts"),
];

// The second way a script can end up on the wrong database, and the one that got past the audit
// above for months. fix-travel-factors.ts imported the APPLICATION's Prisma singleton instead of
// building its own client, so it read neither variable itself, matched no pattern here, and was
// simply missing from CALL_SITES with nothing to notice. It connected on DATABASE_URL alone, which
// on this deployment is the pooled connection rather than the direct one.
//
// src/lib/prisma.ts is right for the app, which is the point: it is a request-scoped client for a
// server that is already configured. A script run by bun is not that, so importing it is always
// the wrong answer under these three trees.
const APP_PRISMA_IMPORT = /from\s+["'`](?:@\/lib\/prisma|(?:\.\.\/)+src\/lib\/prisma)["'`]/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    // Test files fabricate environments on purpose and are not run against a database.
    if (entry === "__tests__" || entry === "node_modules" || entry === ".auth") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (path.endsWith(".ts")) out.push(path);
  }
  return out;
}

// Reports line numbers rather than a boolean, so a failure names the exact spot.
function offendingLines(file: string): number[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .map((line, index) => (RAW_DATASOURCE_READ.test(line) ? index + 1 : 0))
    .filter((line) => line > 0);
}

describe("every script that opens its own connection routes through the helper", () => {
  it("finds no script reading DATABASE_URL or DIRECT_URL out of process.env for itself", () => {
    const offenders = SCRIPT_DIRS.flatMap(walk)
      .map((file) => ({ file, lines: offendingLines(file) }))
      .filter(({ lines }) => lines.length > 0);

    expect(offenders).toEqual([]);
  });

  it("finds no script importing the application's Prisma client instead of building its own", () => {
    const offenders = SCRIPT_DIRS.flatMap(walk).filter((file) =>
      APP_PRISMA_IMPORT.test(readFileSync(file, "utf8")),
    );

    expect(offenders).toEqual([]);
  });

  it("has every known call site importing datasourceUrl", () => {
    const missing = CALL_SITES.filter((file) => {
      const text = readFileSync(file, "utf8");
      return !/import \{ datasourceUrl \} from "[^"]*datasource";/.test(text);
    });

    expect(missing).toEqual([]);
  });

  it("keeps db:bootstrap a real file rather than an inline bun -e script", () => {
    // `bun -e` cannot import anything, so an inline script cannot be given the guard. That is why
    // scripts/bootstrap-db.ts exists at all, and why this asserts the wiring and not just the
    // absence of the old expression.
    const manifest = readFileSync("package.json", "utf8");

    expect(RAW_DATASOURCE_READ.test(manifest)).toBe(false);
    expect(JSON.parse(manifest).scripts["db:bootstrap"]).toBe("bun scripts/bootstrap-db.ts");
  });
});
