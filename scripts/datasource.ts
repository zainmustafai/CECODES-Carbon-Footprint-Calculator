/**
 * The one place a standalone script decides which database it is about to talk to.
 *
 * prisma.config.ts already routes the Prisma CLI (and anything the CLI spawns, such as the seed
 * hook) through resolveDatasourceUrl. Every script invoked DIRECTLY bypasses that file completely:
 * `bun run db:seed`, `bun scripts/init-db.ts`, `bun prisma/import-factors.ts` and the rest never
 * load prisma.config.ts at all. Each of them used to resolve the pair for itself with
 * `DIRECT_URL ?? DATABASE_URL`, which is the exact expression the fix in
 * src/lib/env-precedence.ts exists to replace, so each of them still carried the whole bug.
 * Spelled without the `process.env.` prefix on purpose: the audit in __tests__/datasource.test.ts
 * bans that expression by pattern, and a doc comment is not an exemption worth carving out.
 *
 *   bun auto-loads .env.local before any of this code runs, and it fills in only the variables the
 *   shell left unset. A developer who exports DATABASE_URL alone to name a throwaway container
 *   therefore inherits .env.local's DIRECT_URL, which names the shared production database, and
 *   `??` prefers precisely that survivor. `DATABASE_URL=<throwaway> bun run db:seed` wrote to
 *   production, and with ADMIN_PASSWORD set it rewrote the production admin's password.
 *
 * This module gives those scripts prisma.config.ts's guarantee instead. It resolves DATABASE_URL
 * and DIRECT_URL as ONE decision, normalises process.env so anything the script spawns (init-db.ts
 * shells out to `bunx prisma migrate deploy` and `bun prisma/seed.ts`; seed-prod.ts runs three
 * sub-scripts) inherits that same single answer, and throws rather than guess when the two halves
 * disagree about the host. The rules themselves live in src/lib/env-precedence.ts and are
 * documented there; nothing is re-decided here.
 *
 * What this can and cannot see. The snapshot below is the earliest observation this repo's own
 * code can make in a bun process, and it is exactly as early as prisma.config.ts's: bun has
 * already merged .env.local into process.env by the time any module of ours is evaluated, so a
 * file-supplied half is indistinguishable from an exported one. That is why rule 3 of
 * resolveDatasourceUrl (two halves, two hosts, refuse to guess) is what actually catches the
 * dangerous case here, rather than rule 1. It is also why the snapshot is taken at module scope:
 * ESM evaluates every import before the importing module's body, so this runs before the
 * `loadEnvConfig(process.cwd())` call that several of these scripts make, and @next/env's
 * contribution is therefore correctly excluded from the snapshot.
 */
import { resolveDatasourceUrl } from "../src/lib/env-precedence";

/**
 * process.env as it reached this process. Captured once, at import, for the reason above: any
 * later capture would include whatever an env-file loader the script ran had already merged in.
 */
const SHELL_SNAPSHOT: Readonly<Record<string, string | undefined>> = { ...process.env };

/**
 * The connection string this script should use, or undefined when nothing names a database.
 *
 * Undefined rather than a throw, because the callers do not agree on how to fail and each one's
 * existing failure mode is deliberate: init-db.ts exits 1 through its `[init] FAILED:` logger,
 * verify-fresh-db.ts throws, backfill-auth-credentials.ts prints a message that names the
 * variables without printing their values, and the Prisma adapter callers simply hand undefined
 * on and let Prisma report the missing datasource. Deciding for them here would change behaviour
 * this file has no business changing. It DOES throw for a genuinely ambiguous environment, which
 * is not the same thing as an absent one: see resolveDatasourceUrl.
 *
 * The parameters exist for the tests, which must be able to drive a fabricated environment. No
 * caller passes them.
 */
export function datasourceUrl(
  env: Record<string, string | undefined> = process.env,
  snapshot: Readonly<Record<string, string | undefined>> = SHELL_SNAPSHOT,
): string | undefined {
  return resolveDatasourceUrl(env, snapshot);
}
