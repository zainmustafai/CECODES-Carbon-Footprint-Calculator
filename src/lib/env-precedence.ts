/**
 * Restores exactly the keys `snapshot` already held, undoing whatever set them since the
 * snapshot was taken. A key `snapshot` never had is left alone, so a loader that ran in between
 * can still introduce a genuinely new variable.
 *
 * Exists for prisma.config.ts. dotenv's `override: true` on .env.local is required so .env.local
 * can beat .env, but the same flag lets .env.local just as silently replace an already-exported
 * shell DATABASE_URL/DIRECT_URL with the connection string .env.local holds on a maintainer's
 * machine, which names the shared production database. Calling this immediately after both dotenv
 * loads restores the precedence a shell export is supposed to have: shell env > .env.local > .env.
 * Without it, a command exported to point at a throwaway verification database
 * (scripts/verify-fresh-db.ts) or a pg_restore rehearsal (docs/DATA-MIGRATION.md) would be
 * silently redirected at production instead.
 *
 * Key-by-key restoration is NOT enough for DATABASE_URL and DIRECT_URL, because it can only put
 * back keys the shell actually set: a key the shell left unset is absent from the snapshot, so
 * .env.local's value for it survives untouched. `resolveDatasourceUrl` owns that pair for exactly
 * that reason.
 *
 * Deletes rather than assigns when a snapshot value is `undefined`: Node coerces
 * `process.env.KEY = undefined` to the literal string "undefined", so assigning it back would
 * leave the variable "set" to a truthy four-character string instead of genuinely absent. A
 * snapshot taken as `{ ...process.env }` never carries such an entry, because spreading copies
 * only the keys that exist; a hand-built one can, and this branch is what keeps it honest.
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

/**
 * The two variables that together name one database, in the order every consumer in this repo
 * resolves them: the first usable one wins. DIRECT_URL is the non-pooled session connection
 * Prisma migrations need; DATABASE_URL is the connection the app runtime uses through the pg
 * driver adapter.
 */
export const DATASOURCE_KEYS = ["DIRECT_URL", "DATABASE_URL"] as const;

/**
 * Acknowledges a deployment whose two halves genuinely live on different hosts (a pooler in front
 * of one database is the usual reason). Honoured only from the shell snapshot, never from a value
 * an env file supplies, so a file can never switch off the guard that protects it.
 */
const SPLIT_HOSTS_ALLOWED_KEY = "ALLOW_SPLIT_DATASOURCE_HOSTS";

function isUsable(value: string | undefined): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * The host a connection string names, or null when it cannot be determined. Only ever the host:
 * these values carry credentials and the result ends up in error messages.
 */
function datasourceHost(value: string): string | null {
  const raw = value.trim();
  try {
    const { hostname } = new URL(raw);
    if (hostname !== "") return hostname.toLowerCase();
  } catch {
    // Not a parseable URL. The textual authority below is the fallback.
  }
  const authority = /@([^/?#]*)/u.exec(raw)?.[1];
  if (authority !== undefined && authority !== "") {
    return authority.replace(/:\d+$/u, "").toLowerCase();
  }
  return null;
}

function describeHost(value: string): string {
  return datasourceHost(value) ?? "an unparseable host";
}

/**
 * Decides DATABASE_URL and DIRECT_URL as ONE choice, then returns the URL the Prisma CLI should
 * run against. Also normalises `env` so that anything this process spawns (the seed command, a
 * bun script under prisma/) inherits the same single answer.
 *
 * The hole this closes: `restoreShellEnv` restores only keys the shell set, and
 * `DIRECT_URL ?? DATABASE_URL` prefers DIRECT_URL. A developer who exported only DATABASE_URL to
 * name a throwaway container therefore kept .env.local's production DIRECT_URL, and `??` chose
 * precisely that survivor, so a `DATABASE_URL=postgresql://...@127.0.0.1:55432/postgres bunx
 * prisma migrate deploy` migrated the shared production database while looking like it did not.
 *
 * The rules, in order:
 *
 * 1. If the shell named either half, the shell owns BOTH. Every half the shell did not usably
 *    name is overwritten with the shell's own value, so no env file can supply the other half.
 *    Overwriting rather than deleting matters: bun re-reads .env.local for every bun subprocess
 *    and fills in variables that are absent, but leaves inherited ones alone (an inherited empty
 *    string counts as set), so an explicitly set half is what keeps a child process on the same
 *    database.
 * 2. If the shell named the pair but gave nothing usable (an empty export), refuse to fall back
 *    to a value an env file supplies. Silently borrowing production there is the whole bug. With
 *    nothing available anywhere, both halves are blanked and the caller gets undefined, so
 *    `prisma generate` in a bare checkout still works and Prisma reports the missing datasource
 *    itself for the commands that actually need one.
 * 3. If the shell named BOTH halves and they name different hosts, throw. Under `bun run`, bun has
 *    already merged .env.local into the environment before this file is evaluated, so a
 *    file-supplied half is indistinguishable from an exported one; a disagreement about the host
 *    is the one signal left that the two halves came from different intentions. Guessing between
 *    them is how a throwaway migration reaches production, so it fails loudly instead. Set
 *    ALLOW_SPLIT_DATASOURCE_HOSTS=1 in the real environment for a deployment that means it.
 *    Two file-supplied halves are not second-guessed: with no export in play there is no conflict
 *    of intent to resolve.
 */
export function resolveDatasourceUrl(
  env: Record<string, string | undefined>,
  snapshot: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const shellNamed = DATASOURCE_KEYS.filter((key) => key in snapshot);

  if (shellNamed.length > 0) {
    const shellPair: Record<string, string | undefined> = {};
    for (const key of shellNamed) shellPair[key] = snapshot[key];
    restoreShellEnv(env, shellPair);

    const shellUrl = DATASOURCE_KEYS.map((key) => shellPair[key]).find(isUsable);

    if (shellUrl === undefined) {
      const fileUrl = DATASOURCE_KEYS.filter((key) => !shellNamed.includes(key))
        .map((key) => env[key])
        .find(isUsable);
      if (fileUrl !== undefined) {
        throw new Error(
          `${shellNamed.join(" and ")} was exported empty, so nothing on the command line names a ` +
            `database. Refusing to fall back to the ${describeHost(fileUrl)} connection string an ` +
            `env file supplies: export DATABASE_URL and DIRECT_URL together, or export neither.`,
        );
      }
      for (const key of DATASOURCE_KEYS) env[key] = "";
      return undefined;
    }

    for (const key of DATASOURCE_KEYS) {
      if (!isUsable(shellPair[key])) env[key] = shellUrl;
    }
  }

  const direct = env["DIRECT_URL"];
  const pooled = env["DATABASE_URL"];

  if (
    isUsable(direct) &&
    isUsable(pooled) &&
    DATASOURCE_KEYS.every((key) => key in snapshot) &&
    !isUsable(snapshot[SPLIT_HOSTS_ALLOWED_KEY])
  ) {
    const directHost = datasourceHost(direct);
    const pooledHost = datasourceHost(pooled);
    if (directHost !== null && pooledHost !== null && directHost !== pooledHost) {
      throw new Error(
        `DIRECT_URL names ${directHost} but DATABASE_URL names ${pooledHost}. They must name one ` +
          `database, and this command will not guess which one you meant: export both, or export ` +
          `neither and let the env files decide. Set ${SPLIT_HOSTS_ALLOWED_KEY}=1 if this ` +
          `deployment really does front one database with a pooler on another host.`,
      );
    }
  }

  return [direct, pooled].find(isUsable);
}
