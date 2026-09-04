// Copies sign-in credentials out of Supabase's auth.users and into app_users, in the SAME database.
//
//   bun prisma/backfill-auth-credentials.ts            # dry run: reports, writes nothing
//   bun prisma/backfill-auth-credentials.ts --apply    # writes
//
// A one-off, but written to be run as often as anyone likes. It writes only rows whose
// passwordHash is still null, so a re-run after cutover cannot revert a password someone has
// changed since. That single rule is what makes "run it again and read the counts" a safe way to
// check the migration rather than a second, riskier migration.
//
// auth.users is read through a plain pg client because Prisma has no model for the GoTrue schema
// and should never grow one: that schema belongs to the component being removed. The writes go
// through Prisma, so the columns, their types and their nullability are the ones the app uses.
//
// Nothing here prints a hash, a password, an email address or a connection string. Every line of
// output is a count or a uuid, because the output of a credential migration is exactly the sort of
// text that gets pasted into a chat window to prove the migration worked. The one line this script
// does not compose itself is a failure message, so that one goes through redact() below.

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/lib/generated/prisma/client";

// Both connections use the direct URL. This is maintenance run by a person, not app traffic, so
// the pooler buys nothing and costs a hop. src/lib/prisma.ts is deliberately not reused: it builds
// its client while it is being imported, which under ESM is before the loadEnvConfig above has had
// a chance to run, and it aims at the pooled URL by design.
const CONNECTION_STRING = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!CONNECTION_STRING) {
  // Named, never printed: the URL carries the database password.
  console.error("Neither DIRECT_URL nor DATABASE_URL is set. There is nothing to connect to.");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: CONNECTION_STRING });
const prisma = new PrismaClient({ adapter });
const authDb = new Client({ connectionString: CONNECTION_STRING });

const USAGE = "usage: bun prisma/backfill-auth-credentials.ts [--apply]";

// GoTrue stores bcrypt, and the Phase 0 audit confirmed every row is a $2a$ hash of length 60. The
// shape is still checked per row, because this script writes passwordAlgo = "bcrypt" as a
// statement of fact: copying anything else under that label produces a row that cannot
// authenticate and carries no clue as to why.
//
// One source string, two uses: anchored to validate a single value, unanchored to find one hiding
// inside a longer piece of text. Two separate literals would drift, and the one that would drift
// silently is the one that keeps hashes out of the terminal.
const BCRYPT_HASH_BODY = String.raw`\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}`;
const BCRYPT_HASH = new RegExp(`^${BCRYPT_HASH_BODY}$`);

// Prisma renders the arguments of a failing call into its error message, and every write below
// carries data.passwordHash, so a mistake as ordinary as running this against a client generated
// before the credential columns existed ends the run by printing a live bcrypt hash. A hash is a
// password an attacker can grind offline at leisure, and this script's whole reason for printing
// anything is that its output gets pasted somewhere to prove the migration worked.
const SECRET_SHAPES: ReadonlyArray<[RegExp, string]> = [
  [new RegExp(BCRYPT_HASH_BODY, "g"), "[hash redacted]"],
  [/postgres(?:ql)?:\/\/\S+/gi, "[connection string redacted]"],
];

function redact(text: string): string {
  return SECRET_SHAPES.reduce((out, [shape, replacement]) => out.replace(shape, replacement), text);
}

type AuthRow = {
  id: string;
  email: string | null;
  encrypted_password: string | null;
  email_confirmed_at: Date | null;
  last_sign_in_at: Date | null;
  // Computed in SQL rather than read as columns: see the query for why.
  revoked: boolean;
};

function parseArgs(argv: string[]): { apply: boolean } {
  let apply = false;
  for (const arg of argv) {
    if (arg === "--apply") apply = true;
    // An unrecognised argument is refused rather than ignored. The failure that prevents is
    // specific to this script: a typo like `--aply` would parse as nothing at all, the run would
    // report a clean dry run, and whoever read that report would then cut sign-in over to a table
    // with no passwords in it.
    else throw new Error(`Unknown argument: ${arg}\n${USAGE}`);
  }
  return { apply };
}

function printSection(title: string, ids: string[]) {
  console.log(`\n--- ${title}: ${ids.length} ---`);
  for (const id of ids) console.log(`  ${id}`);
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));
  console.log(
    apply
      ? "Credential backfill - APPLYING (idempotent; a password already set is never overwritten)"
      : "Credential backfill - DRY RUN (writes nothing; pass --apply to write)",
  );

  await authDb.connect();

  // to_regclass answers "does this relation exist, and can this role see it" without raising, so a
  // database where GoTrue has already been dropped gets the message below instead of a 42P01 stack
  // trace that reads like a bug in this script.
  const probe = await authDb.query<{ present: boolean }>(
    "SELECT to_regclass('auth.users') IS NOT NULL AS present",
  );
  if (!probe.rows[0]?.present) {
    throw new Error(
      "auth.users does not exist in this database, or is not visible to this role. " +
        "There is nothing to copy from; if Supabase Auth is already gone, this backfill is done.",
    );
  }

  // banned_until and deleted_at are the two ways an account is switched off in GoTrue without its
  // row or its password going anywhere, and nothing in this app reads either one. Copy such a hash
  // across and the cutover quietly reinstates the account: it could not sign in the day before and
  // can the day after. They are read through to_jsonb rather than named as columns because they
  // arrived in different GoTrue versions, and a 42703 on a database that predates one of them would
  // stop the backfill dead over a check that only ever tightens it.
  const authRows = await authDb.query<AuthRow>(
    `SELECT u.id::text AS id,
            u.email,
            u.encrypted_password,
            u.email_confirmed_at,
            u.last_sign_in_at,
            ((to_jsonb(u) ->> 'deleted_at') IS NOT NULL
              OR COALESCE((to_jsonb(u) ->> 'banned_until')::timestamptz > now(), false)) AS revoked
       FROM auth.users u`,
  );

  const profiles = await prisma.appUser.findMany({
    select: { id: true, email: true, passwordHash: true },
  });

  // Matching is on id, and only on id. Both tables were built with the same uuids, so the id is
  // the real key; email is a second, weaker one that can drift (a change applied on one side only,
  // a difference in case or in whitespace) and pairing on it would hand one person's password to
  // another person's profile without anything looking wrong. Email is read purely to report the
  // mismatch count below.
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const authIds = new Set(authRows.rows.map((row) => row.id));

  const counts = {
    matched: 0,
    written: 0,
    skippedAlreadySet: 0,
    authWithoutProfile: 0,
    profileWithoutAuth: 0,
    missingHash: 0,
    skippedUnknownAlgo: 0,
    skippedRevoked: 0,
    emailMismatch: 0,
  };

  const authWithoutProfileIds: string[] = [];
  const profileWithoutAuthIds: string[] = [];
  const missingHashIds: string[] = [];
  const unknownAlgoIds: string[] = [];
  const revokedIds: string[] = [];
  const emailMismatchIds: string[] = [];

  type Planned = {
    id: string;
    passwordHash: string;
    emailConfirmedAt: Date | null;
    lastSignInAt: Date | null;
  };
  const planned: Planned[] = [];

  for (const row of authRows.rows) {
    const profile = profileById.get(row.id);
    if (!profile) {
      counts.authWithoutProfile++;
      authWithoutProfileIds.push(row.id);
      continue;
    }
    counts.matched++;

    if (row.email && profile.email.trim().toLowerCase() !== row.email.trim().toLowerCase()) {
      counts.emailMismatch++;
      emailMismatchIds.push(row.id);
    }

    // A row is counted under the first reason that applies and no other, and a revoked GoTrue
    // account is checked before the rest so that it is never filed as a routine skip. Refusing to
    // copy is the safe direction: the worst case is a real person who has to be given a password by
    // hand, against an account someone deliberately switched off getting one back.
    if (row.revoked) {
      counts.skippedRevoked++;
      revokedIds.push(row.id);
      continue;
    }

    // Checked before anything else about the credential, and it skips the whole row rather than
    // just the hash column. lastSignInAt is maintained by the app once sign-in runs here, so
    // rewriting it from this frozen copy of auth.users would move a live fact backwards.
    if (profile.passwordHash !== null) {
      counts.skippedAlreadySet++;
      continue;
    }

    const hash = row.encrypted_password?.trim() ?? "";
    if (hash === "") {
      counts.missingHash++;
      missingHashIds.push(row.id);
      continue;
    }
    if (!BCRYPT_HASH.test(hash)) {
      counts.skippedUnknownAlgo++;
      unknownAlgoIds.push(row.id);
      continue;
    }

    planned.push({
      id: row.id,
      passwordHash: hash,
      emailConfirmedAt: row.email_confirmed_at,
      lastSignInAt: row.last_sign_in_at,
    });
  }

  for (const profile of profiles) {
    if (authIds.has(profile.id)) continue;
    counts.profileWithoutAuth++;
    profileWithoutAuthIds.push(profile.id);
  }

  let writtenIds: string[] = [];

  if (apply && planned.length > 0) {
    // One transaction for the whole backfill. A half-written one is the worst outcome available
    // here: once the run is over, the half that landed is indistinguishable from the half that did
    // not, and the only way left to tell them apart is asking users to try signing in.
    writtenIds = await prisma.$transaction(
      async (tx) => {
        const ids: string[] = [];
        for (const plan of planned) {
          // `passwordHash: null` sits in the WHERE, not only in the scan that built `planned`, so
          // "never overwrite a password" is a property of the write itself rather than of a read
          // that happened earlier. updateMany reports { count } instead of throwing, so the count
          // is the only thing that says whether the row was really ours to write, and the id is
          // only reported as written once that count has said so.
          const result = await tx.appUser.updateMany({
            where: { id: plan.id, passwordHash: null },
            data: {
              passwordHash: plan.passwordHash,
              passwordAlgo: "bcrypt",
              emailConfirmedAt: plan.emailConfirmedAt,
              lastSignInAt: plan.lastSignInAt,
            },
          });
          if (result.count > 0) ids.push(plan.id);
        }
        return ids;
      },
      // Prisma's default interactive-transaction budget is 5 seconds, and this loop spends one
      // round trip per row against a database that is not local: at 200ms each, the default runs
      // out somewhere around two dozen members. The backfill would then roll back whole and report
      // "Transaction already closed", which reads as a bug in this script rather than as a clock
      // expiring, and the obvious response to it (run it again) fails the same way every time.
      { timeout: 10 * 60_000, maxWait: 30_000 },
    );
  }

  counts.written = writtenIds.length;

  printSection(
    apply ? "Credentials written" : "Credentials that would be written",
    apply ? writtenIds : planned.map((plan) => plan.id),
  );
  printSection("Matched, but auth.users holds no password (nothing to copy)", missingHashIds);
  printSection("Matched, but the stored hash is not bcrypt (left alone)", unknownAlgoIds);
  printSection("Matched, but banned or deleted in GoTrue (left with no password)", revokedIds);
  printSection("Matched on id, emails differ (sign-in uses the app_users one)", emailMismatchIds);

  // Its own block, printed whatever the numbers are. These two are not statistics, they are the
  // cutover decision: anyone in either list cannot sign in the moment Supabase Auth is switched
  // off, and a support call is too late to learn it. An app_users row that never had a GoTrue
  // account (one created straight into this database, a test fixture for instance) belongs in the
  // second list and is not necessarily a problem, which is why the ids are printed and not just
  // the total.
  console.log("\n========== CUTOVER SAFETY (read this even when both are 0) ==========");
  console.log(`  authWithoutProfile: ${counts.authWithoutProfile}  (GoTrue account, no profile)`);
  for (const id of authWithoutProfileIds) console.log(`      ${id}`);
  console.log(`  profileWithoutAuth: ${counts.profileWithoutAuth}  (profile, no GoTrue account)`);
  for (const id of profileWithoutAuthIds) console.log(`      ${id}`);
  if (counts.authWithoutProfile === 0 && counts.profileWithoutAuth === 0) {
    console.log("  Every account on both sides is paired.");
  }
  console.log("=====================================================================");

  console.log("\n========== SUMMARY ==========");
  console.log(`  matched:            ${counts.matched}`);
  console.log(`  written:            ${counts.written}`);
  console.log(`  pendingToWrite:     ${planned.length - counts.written}`);
  console.log(`  skippedAlreadySet:  ${counts.skippedAlreadySet}`);
  console.log(`  authWithoutProfile: ${counts.authWithoutProfile}`);
  console.log(`  profileWithoutAuth: ${counts.profileWithoutAuth}`);
  console.log(`  missingHash:        ${counts.missingHash}`);
  console.log(`  skippedUnknownAlgo: ${counts.skippedUnknownAlgo}`);
  console.log(`  skippedRevoked:     ${counts.skippedRevoked}`);
  console.log(`  emailMismatch:      ${counts.emailMismatch}`);
  console.log("=============================");

  if (apply && counts.written < planned.length) {
    // Only reachable if a row gained a password between the scan and the transaction. Reported,
    // never retried: whoever set that password did so on purpose.
    console.log(
      `NOTE: ${planned.length - counts.written} row(s) gained a password between the scan and ` +
        "the write and were left untouched. Re-run to see the current state.",
    );
  }
  if (!apply) console.log("DRY RUN: nothing was written. Re-run with --apply to write.");
}

main()
  .catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`\nBACKFILL FAILED: ${redact(detail)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Closed independently. Both hold open sockets that keep the event loop alive, so letting one
    // failure skip the other leaves the run sitting at a prompt that never returns, after output
    // that says it finished. Neither failure changes what is in the database by then.
    await authDb.end().catch(() => {});
    await prisma.$disconnect().catch(() => {});
  });
