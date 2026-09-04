import { describe, expect, it } from "vitest";
import { restoreShellEnv } from "../env-precedence";

// prisma.config.ts snapshots process.env before loading .env then .env.local (override: true),
// then calls restoreShellEnv so a shell-exported variable always wins. Left unfixed, .env.local's
// committed production DATABASE_URL/DIRECT_URL silently replaces whatever a verification command
// exported on the command line, pointing a throwaway-database command at the shared production
// database instead (see Task 1's report for the incident this pins down). This test asserts the
// precedence directly against the same helper, without touching real files, real dotenv, or a
// database, so a regression here fails a normal `bun run test` rather than a rare, dangerous
// database session.

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
      NEXT_PUBLIC_SUPABASE_URL: "https://from-env-local.supabase.co",
    };

    restoreShellEnv(env, shellSnapshot);

    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://from-env-local.supabase.co");
  });

  it("deletes a key rather than assigning the literal string \"undefined\"", () => {
    // The shell snapshot recorded this variable as genuinely absent.
    const shellSnapshot: Record<string, string | undefined> = { FEATURE_FLAG_X: undefined };
    const env: Record<string, string | undefined> = { FEATURE_FLAG_X: "set-by-env-local" };

    restoreShellEnv(env, shellSnapshot);

    expect("FEATURE_FLAG_X" in env).toBe(false);
  });
});
