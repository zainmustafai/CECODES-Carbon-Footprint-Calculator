/**
 * Restores exactly the keys `snapshot` already held, undoing whatever set them since the
 * snapshot was taken. A key `snapshot` never had is left alone, so a loader that ran in between
 * can still introduce a genuinely new variable.
 *
 * Exists for prisma.config.ts. dotenv's `override: true` on .env.local is required so .env.local
 * can beat .env, but the same flag lets .env.local just as silently replace an already-exported
 * shell DATABASE_URL/DIRECT_URL with this repo's committed connection string, which names the
 * shared production database. Calling this immediately after both dotenv loads restores the
 * precedence a shell export is supposed to have: shell env > .env.local > .env. Without it, a
 * command exported to point at a throwaway verification database (scripts/verify-fresh-db.ts) or
 * a pg_restore rehearsal (Task 14) would be silently redirected at production instead.
 *
 * Deletes rather than assigns when a snapshot value is `undefined`: Node coerces
 * `process.env.KEY = undefined` to the literal string "undefined", so assigning it back would
 * leave the variable "set" to a truthy four-character string instead of genuinely absent.
 */
export function restoreShellEnv(
  env: Record<string, string | undefined>,
  snapshot: Readonly<Record<string, string | undefined>>,
): void {
  for (const key of Object.keys(snapshot)) {
    const value = snapshot[key];
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
}
