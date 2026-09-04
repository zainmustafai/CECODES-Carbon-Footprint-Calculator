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
import { classifyHash, costPrefix } from "../src/lib/auth/hash-shape";

// classifyHash and costPrefix live in src/lib/auth/hash-shape.ts, tested there directly against a
// table of hash shapes. This file owns only the query and the printing.

async function main() {
  const adapter = new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  });
  const prisma = new PrismaClient({ adapter });

  // The one place this script could leak something it should not: a query failure surfaces
  // through pg and the driver adapter, and nothing here controls what text they put on that
  // error, only that this file must never repeat it. So the caught value itself is never touched,
  // logged, or included in the process exit path; only a fixed message that names no value is.
  let users: Array<{ passwordHash: string | null }>;
  try {
    users = await prisma.appUser.findMany({ select: { passwordHash: true } });
  } catch {
    console.error("FAILED: could not read app_users. Check the database connection and retry.");
    await prisma.$disconnect();
    process.exit(1);
  }

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

// Guarded so this module can be imported without opening a database connection as a side effect.
// Compared as URLs rather than raw paths because that is what normalizes drive letters and slash
// direction consistently across platforms.
const isEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  await main();
}
