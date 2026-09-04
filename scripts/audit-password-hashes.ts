/**
 * Read-only. Asserts every stored credential is a well-formed bcrypt hash.
 *
 * This is the standing evidence that bcrypt verification stays trustworthy for every account,
 * including the ones migrated off Supabase Auth whose passwords nobody knows: bcrypt verification
 * is deterministic and depends only on the hash string, so a format audit plus the canonical
 * OpenBSD vectors in password.test.ts covers every user rather than a sample. It was written to
 * run once before the Supabase fallback was deleted; it stays afterward as the tool that checks
 * every stored credential is still well formed and therefore verifiable, for example after a bulk
 * import or a manual database fix.
 *
 * It SELECTs and nothing else. It prints counts and never a hash, an id, an email address or a
 * connection string.
 */
import { pathToFileURL } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/lib/generated/prisma/client";

// $2a$ is what GoTrue produced; $2b$ is what bcryptjs produces now; $2y$ is another
// bcrypt-compatible variant seen in the wild. All three are 60 characters with a two-digit cost.
// Anything else cannot be verified and would lock its owner out silently.
const WELL_FORMED = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export type HashClass = "well-formed" | "missing" | "malformed";

/**
 * Classifies one stored `passwordHash` value with no side effects: no database, no I/O, no
 * randomness. Kept separate from `main` so the classification rule itself, which is the one
 * thing this whole audit rests on, can be tested directly against a table of hash shapes
 * without a database connection.
 *
 * "missing" is survivable, since that user resets their password. "malformed" is not: a
 * malformed value is still read as a credential by verifyPassword and will never match anything,
 * silently locking its owner out.
 */
export function classifyHash(hash: string | null | undefined): HashClass {
  if (!hash) return "missing";
  return WELL_FORMED.test(hash) ? "well-formed" : "malformed";
}

/**
 * The algorithm and cost prefix of a well-formed hash, for example "$2a$12$". Never call this on
 * anything classifyHash did not already call "well-formed": it assumes the hash is at least 7
 * characters long.
 */
export function costPrefix(hash: string): string {
  return hash.slice(0, 7);
}

async function main() {
  const adapter = new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  });
  const prisma = new PrismaClient({ adapter });

  const users = await prisma.appUser.findMany({ select: { passwordHash: true } });

  let ok = 0;
  let malformed = 0;
  let missing = 0;
  const costs = new Map<string, number>();

  for (const user of users) {
    const cls = classifyHash(user.passwordHash);
    if (cls === "missing") {
      missing += 1;
      continue;
    }
    if (cls === "malformed") {
      malformed += 1;
      continue;
    }
    ok += 1;
    const prefix = costPrefix(user.passwordHash as string);
    costs.set(prefix, (costs.get(prefix) ?? 0) + 1);
  }

  console.log(`users:            ${users.length}`);
  console.log(`well-formed:      ${ok}`);
  console.log(`missing hash:     ${missing}`);
  console.log(`malformed hash:   ${malformed}`);
  for (const [prefix, count] of [...costs].sort()) console.log(`  ${prefix}  ${count}`);

  await prisma.$disconnect();

  // A missing hash is survivable: that user resets their password. A malformed one is not,
  // because it would be read as a credential and never match anything.
  if (malformed > 0) {
    console.error("\nFAILED: malformed hashes present. Investigate before anyone relies on those rows.");
    process.exit(1);
  }
  console.log("\nOK: every stored credential is verifiable bcrypt.");
}

// Guarded so the pure classification functions above can be imported (for example by a test)
// without also opening a database connection. Compared as URLs rather than raw paths because that
// is what normalizes drive letters and slash direction consistently across platforms.
const isEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  await main();
}
