import { describe, expect, it } from "vitest";
import { resolveDatasourceUrl, restoreShellEnv } from "../env-precedence";

// prisma.config.ts snapshots process.env before loading .env then .env.local (override: true),
// then hands both to this module. Left unfixed, .env.local's production DATABASE_URL/DIRECT_URL
// silently replaces whatever a verification command exported on the command line, pointing a
// throwaway-database command at the shared production database instead. These tests assert the
// precedence directly against the same helpers, without touching real files, real dotenv, or a
// database, so a regression here fails a normal `bun run test` rather than a rare, dangerous
// database session.

// Stand-ins for the two connection strings that must never be confused for one another. The
// production host is the shape .env.local holds on a maintainer's machine; the throwaway is the
// local container scripts/verify-fresh-db.ts and docs/DATA-MIGRATION.md tell you to export.
const PRODUCTION = "postgresql://app:secret@aws-1-us-west-2.pooler.supabase.com:5432/postgres";
const PRODUCTION_POOLED = "postgresql://app:secret@aws-1-us-west-2.pooler.supabase.com:6543/postgres";
const THROWAWAY = "postgresql://postgres:verify@127.0.0.1:55432/postgres";

describe("restoreShellEnv", () => {
  it("gives a shell-exported value precedence over what .env.local just set", () => {
    // What the shell actually had before prisma.config.ts touched anything.
    const shellSnapshot = { DATABASE_URL: "postgresql://shell-export/db" };
    // Simulates dotenv({ override: true }) on .env.local having already clobbered it.
    const env: Record<string, string | undefined> = {
      DATABASE_URL: "postgresql://env-local/db",
    };

    restoreShellEnv(env, shellSnapshot);

    expect(env.DATABASE_URL).toBe("postgresql://shell-export/db");
  });

  it("leaves a variable only .env.local defines untouched", () => {
    // The shell never set this one, so .env.local is allowed to keep winning for it.
    const shellSnapshot = {};
    const env: Record<string, string | undefined> = {
      SITE_URL: "https://from-env-local.example.org",
    };

    restoreShellEnv(env, shellSnapshot);

    expect(env.SITE_URL).toBe("https://from-env-local.example.org");
  });

  it('deletes a key rather than assigning the literal string "undefined"', () => {
    // Defensive branch, for a snapshot built by hand rather than spread from an environment:
    // `process.env.KEY = undefined` would store the four-character string "undefined".
    const shellSnapshot: Record<string, string | undefined> = { DEMO_SEED_ALLOWED: undefined };
    const env: Record<string, string | undefined> = { DEMO_SEED_ALLOWED: "set-by-env-local" };

    restoreShellEnv(env, shellSnapshot);

    expect("DEMO_SEED_ALLOWED" in env).toBe(false);
  });

  it("cannot protect a variable the shell never set, which is why the datasource pair has its own rule", () => {
    // The real snapshot is `{ ...process.env }`, and spreading copies only the keys that exist: a
    // variable the shell left unset is absent from the snapshot, not present-and-undefined. So
    // restoreShellEnv never touches it and .env.local's value survives. Harmless for most keys,
    // fatal for DIRECT_URL, because `DIRECT_URL ?? DATABASE_URL` then prefers the survivor.
    const shellEnvironment: Record<string, string | undefined> = { DATABASE_URL: THROWAWAY };
    const shellSnapshot = { ...shellEnvironment };
    const env: Record<string, string | undefined> = {
      DATABASE_URL: PRODUCTION,
      DIRECT_URL: PRODUCTION,
    };

    expect("DIRECT_URL" in shellSnapshot).toBe(false);

    restoreShellEnv(env, shellSnapshot);

    expect(env.DATABASE_URL).toBe(THROWAWAY);
    expect(env.DIRECT_URL).toBe(PRODUCTION);
  });
});

describe("resolveDatasourceUrl", () => {
  it("does not let .env.local supply DIRECT_URL when the shell exported only DATABASE_URL", () => {
    // The reported ship-blocker: `DATABASE_URL=<throwaway> bunx prisma migrate deploy` migrated
    // the shared production database, because .env.local's DIRECT_URL survived and won the `??`.
    const shellSnapshot = { DATABASE_URL: THROWAWAY };
    const env: Record<string, string | undefined> = {
      DATABASE_URL: PRODUCTION,
      DIRECT_URL: PRODUCTION,
    };

    const url = resolveDatasourceUrl(env, shellSnapshot);

    expect(url).toBe(THROWAWAY);
    // And the pair is normalised, so a spawned `bun ./prisma/seed.ts` resolving the same two
    // variables cannot land on production either.
    expect(env.DIRECT_URL).toBe(THROWAWAY);
    expect(env.DATABASE_URL).toBe(THROWAWAY);
  });

  it("does not let .env.local supply DATABASE_URL when the shell exported only DIRECT_URL", () => {
    // The mirror image, and the shape docs/DATA-MIGRATION.md actually tells you to run.
    const shellSnapshot = { DIRECT_URL: THROWAWAY };
    const env: Record<string, string | undefined> = {
      DATABASE_URL: PRODUCTION,
      DIRECT_URL: PRODUCTION,
    };

    const url = resolveDatasourceUrl(env, shellSnapshot);

    expect(url).toBe(THROWAWAY);
    expect(env.DATABASE_URL).toBe(THROWAWAY);
    expect(env.DIRECT_URL).toBe(THROWAWAY);
  });

  it("keeps both halves when the shell exported a pooled and a direct URL on one host", () => {
    // Guard against over-tightening: one database reached on two ports is the normal deployment,
    // and nothing here may throw or rewrite it.
    const shellSnapshot = { DATABASE_URL: PRODUCTION_POOLED, DIRECT_URL: PRODUCTION };
    const env: Record<string, string | undefined> = {
      DATABASE_URL: PRODUCTION_POOLED,
      DIRECT_URL: PRODUCTION,
    };

    const url = resolveDatasourceUrl(env, shellSnapshot);

    expect(url).toBe(PRODUCTION);
    expect(env.DATABASE_URL).toBe(PRODUCTION_POOLED);
    expect(env.DIRECT_URL).toBe(PRODUCTION);
  });

  it("refuses to guess when the two halves name different hosts", () => {
    // `bun run db:deploy` merges .env.local into the environment before prisma.config.ts is
    // evaluated, so a file-supplied half looks exactly like an exported one. A disagreement about
    // the host is the only signal left that the two halves came from different intentions, and
    // picking either one silently is how a throwaway migration reaches production.
    const shellSnapshot = { DATABASE_URL: THROWAWAY, DIRECT_URL: PRODUCTION };
    const env: Record<string, string | undefined> = {
      DATABASE_URL: THROWAWAY,
      DIRECT_URL: PRODUCTION,
    };

    expect(() => resolveDatasourceUrl(env, shellSnapshot)).toThrowError(
      /DIRECT_URL names aws-1-us-west-2\.pooler\.supabase\.com but DATABASE_URL names 127\.0\.0\.1/,
    );
    // Hosts only. The message is printed by a CLI and must never carry credentials.
    expect(() => resolveDatasourceUrl(env, shellSnapshot)).not.toThrowError(/secret|verify/);
  });

  // The three below exercise the textual fallback inside the host comparison, which had no test
  // and is the code that decides whether this guard fires at all. It is not an exotic path: a
  // connection string written without its postgresql:// scheme parses as an opaque URL whose
  // hostname is the empty string, so `new URL()` succeeds and tells you nothing, and the regex
  // below it is what actually answers. A guard whose comparator silently returns null stops
  // guarding, which is the failure that matters here.
  it("compares hosts textually when the connection string has no scheme to parse", () => {
    const shellSnapshot = {
      DATABASE_URL: "cecodes:cecodes-local-dev@localhost:5432/cecodes",
      DIRECT_URL: "cecodes:cecodes-local-dev@prod.example.com:5432/cecodes",
    };
    const env: Record<string, string | undefined> = { ...shellSnapshot };

    expect(() => resolveDatasourceUrl(env, shellSnapshot)).toThrowError(
      /DIRECT_URL names prod\.example\.com but DATABASE_URL names localhost/,
    );
    // Still hosts only: the fallback must not print the credentials it just walked past.
    expect(() => resolveDatasourceUrl(env, shellSnapshot)).not.toThrowError(/cecodes-local-dev/);
  });

  it("treats a host that differs only in case or port as the same host", () => {
    // Otherwise the guard fires on a deployment that named one database twice, and the operator
    // learns to reach for the escape hatch, which is how a real guard gets disabled for good.
    const shellSnapshot = {
      DATABASE_URL: "cecodes:pw@PROD.Example.COM:6543/cecodes",
      DIRECT_URL: "cecodes:pw@prod.example.com:5432/cecodes",
    };
    const env: Record<string, string | undefined> = { ...shellSnapshot };

    expect(() => resolveDatasourceUrl(env, shellSnapshot)).not.toThrow();
  });

  it("allows the pair through when a host cannot be determined at all", () => {
    // Deliberately fail-open, and worth pinning so the choice is visible rather than incidental.
    // With no host to compare, refusing would block every unusual but legitimate connection
    // string on a guess, and Prisma's own parser is the thing entitled to reject it. The
    // protection that still applies is rule 1: an exported half already overwrote the other, so
    // an env file cannot have supplied the value being returned here.
    const shellSnapshot = { DATABASE_URL: "not-a-connection-string", DIRECT_URL: PRODUCTION };
    const env: Record<string, string | undefined> = { ...shellSnapshot };

    expect(() => resolveDatasourceUrl(env, shellSnapshot)).not.toThrow();
  });

  it("accepts different hosts when the environment says the split is deliberate", () => {
    // Guard on the escape hatch: a deployment that really does front one database with a pooler
    // elsewhere must still be able to run migrations.
    const shellSnapshot = {
      DATABASE_URL: PRODUCTION_POOLED,
      DIRECT_URL: "postgresql://app:secret@db.project.supabase.co:5432/postgres",
      ALLOW_SPLIT_DATASOURCE_HOSTS: "1",
    };
    const env: Record<string, string | undefined> = {
      DATABASE_URL: shellSnapshot.DATABASE_URL,
      DIRECT_URL: shellSnapshot.DIRECT_URL,
    };

    const url = resolveDatasourceUrl(env, shellSnapshot);

    expect(url).toBe("postgresql://app:secret@db.project.supabase.co:5432/postgres");
  });

  it("leaves the env files alone when the shell exported neither half", () => {
    // Guard: with no export in play there is no conflict of intent, so two file-supplied halves
    // are used as written even if they name different hosts.
    const shellSnapshot = {};
    const env: Record<string, string | undefined> = {
      DATABASE_URL: PRODUCTION_POOLED,
      DIRECT_URL: "postgresql://app:secret@db.project.supabase.co:5432/postgres",
    };

    const url = resolveDatasourceUrl(env, shellSnapshot);

    expect(url).toBe("postgresql://app:secret@db.project.supabase.co:5432/postgres");
    expect(env.DATABASE_URL).toBe(PRODUCTION_POOLED);
  });

  it("throws rather than borrow production when the shell exported an empty DATABASE_URL", () => {
    // `DATABASE_URL= bunx prisma migrate deploy` names no database at all. `??` treats the empty
    // string as a value for DATABASE_URL and as no reason to skip DIRECT_URL, so it used to fall
    // straight through to .env.local's production connection string.
    const shellSnapshot = { DATABASE_URL: "" };
    const env: Record<string, string | undefined> = {
      DATABASE_URL: "",
      DIRECT_URL: PRODUCTION,
    };

    expect(() => resolveDatasourceUrl(env, shellSnapshot)).toThrowError(
      /DATABASE_URL was exported empty[\s\S]*aws-1-us-west-2\.pooler\.supabase\.com/,
    );
  });

  it("resolves the usable half when the shell exported one empty and one real URL", () => {
    const shellSnapshot = { DATABASE_URL: "", DIRECT_URL: THROWAWAY };
    const env: Record<string, string | undefined> = {
      DATABASE_URL: "",
      DIRECT_URL: THROWAWAY,
    };

    const url = resolveDatasourceUrl(env, shellSnapshot);

    expect(url).toBe(THROWAWAY);
    // The empty half is filled in from the same decision, so a bun subprocess reading
    // DIRECT_URL ?? DATABASE_URL cannot let .env.local answer for it.
    expect(env.DATABASE_URL).toBe(THROWAWAY);
  });

  it("blanks both halves when the shell exported an empty URL and no file supplies one", () => {
    // Nothing to run against, and nothing to fall back to. Returning undefined lets Prisma report
    // the missing datasource itself, which keeps `prisma generate` working in a bare checkout.
    // Blanking rather than deleting is what stops a bun subprocess from filling the gap from
    // .env.local: bun fills in absent variables but leaves inherited empty ones alone.
    const shellSnapshot = { DATABASE_URL: "" };
    const env: Record<string, string | undefined> = { DATABASE_URL: "" };

    const url = resolveDatasourceUrl(env, shellSnapshot);

    expect(url).toBeUndefined();
    expect(env.DATABASE_URL).toBe("");
    expect(env.DIRECT_URL).toBe("");
  });

  it("skips a blank DIRECT_URL instead of returning the empty string", () => {
    // `??` only skips null and undefined, so an .env.local line of DIRECT_URL="" used to win and
    // hand Prisma an empty connection string while a perfectly good DATABASE_URL sat next to it.
    const shellSnapshot = {};
    const env: Record<string, string | undefined> = {
      DATABASE_URL: THROWAWAY,
      DIRECT_URL: "",
    };

    const url = resolveDatasourceUrl(env, shellSnapshot);

    expect(url).toBe(THROWAWAY);
  });

  it("returns undefined when nothing anywhere names a database", () => {
    // Guard: `prisma generate` runs from postinstall in environments that have no database at all.
    const env: Record<string, string | undefined> = {};

    expect(resolveDatasourceUrl(env, {})).toBeUndefined();
  });
});
