import { compare, getRounds, hash as bcryptHash } from "bcryptjs";

// Password hashing for the self-hosted sign-in that replaces Supabase Auth.
//
// The accounts that came across the migration keep the hashes GoTrue wrote, so this file has to
// verify what Supabase produced (a $2a$ hash, 60 characters) as readily as what it writes itself.
// bcrypt carries its version, cost and salt inside the hash string, which is what lets one code
// path cover both without a flag day or a forced reset for everyone.
//
// Nothing here reads the database or builds a message. It answers "does this password match this
// hash", and "was that hash made below the cost we write today", and the caller decides what to do
// with either answer.

/**
 * The label stored in AppUser.passwordAlgo beside every hash this file produces.
 *
 * Recorded rather than inferred from the hash so a later move to another algorithm is additive:
 * each row says what made it, and verification refuses a label it does not implement instead of
 * guessing at the bytes.
 */
export const PASSWORD_ALGO = "bcrypt";

/**
 * The bcrypt cost, deliberately above the common default of 10.
 *
 * 10 was a fair default a decade ago and is thin for 2026 hardware. Every step doubles the work,
 * so 12 costs about four times as much: roughly a quarter of a second here, comfortably under a
 * second, and it is paid on a sign-in that throttle.ts already caps at a handful of attempts per
 * address per quarter hour. Someone working offline through a stolen hash pays the same factor
 * with no throttle to work around, which is the point of paying it at all.
 */
export const BCRYPT_COST = 12;

/**
 * A real hash at BCRYPT_COST, of a random string that was thrown away, compared against whenever
 * there is no stored hash to compare against.
 *
 * Sign-in is a public POST endpoint. Returning early for an address with no hash would answer in
 * under a millisecond while a real account takes a quarter of a second, and that gap is an account
 * enumeration oracle that opaque error keys do nothing to close. Spending the same work against a
 * hash that cannot match closes that gap.
 *
 * What it does not close on its own: this hash is fixed at BCRYPT_COST, so it only imitates rows
 * stored at BCRYPT_COST. A row at a lower cost answers faster than this dummy does, by a factor of
 * two per step, which is a smaller oracle pointing the other way. Every hash the migration brought
 * in was made by GoTrue at whatever cost GoTrue chose, and every later raise of BCRYPT_COST puts
 * the whole table below the dummy again, so this is the ordinary state rather than a hypothetical.
 * needsRehash is what drains it.
 */
const DUMMY_HASH = "$2b$12$816GcZOV9tNs87m1kLZzUeGghdKAD/KGYiZynW4kz3LFfoMGFymZ.";

/**
 * Hashes a new password. The returned algo goes into the column next to the hash.
 *
 * No length or strength rule lives here: that belongs to the Zod schema on the way in. Worth
 * knowing that bcrypt reads at most the first 72 bytes of a password and ignores the rest.
 */
export async function hashPassword(plain: string): Promise<{ hash: string; algo: string }> {
  return { hash: await bcryptHash(plain, BCRYPT_COST), algo: PASSWORD_ALGO };
}

/**
 * Whether `plain` is the password behind `hash`.
 *
 * A null, undefined or empty hash is refused. This is the one line in the file that must never be
 * written the other way: a row with no hash is an account that cannot authenticate, never an
 * account that needs no password, and an accidental early `return true` there hands every such
 * account to anyone who types its address. Backfilled rows and any future invite flow both produce
 * exactly that state, so it is the ordinary case rather than a corner one.
 *
 * `algo` is optional because callers pass the column straight through and it is null on any row
 * written before that column existed. Absence is not a value: it means nothing was recorded, and
 * bcrypt is the only thing this file has ever written, so bcrypt stays the reading. A label that
 * names something else is refused outright rather than handed to bcrypt on the hope that the
 * stored string happens to be a bcrypt hash anyway.
 */
export async function verifyPassword(
  plain: string,
  hash: string | null | undefined,
  algo?: string | null,
): Promise<boolean> {
  const unknownAlgo = algo != null && algo !== PASSWORD_ALGO;

  if (!hash || unknownAlgo) {
    // Discarded on purpose. Only the time it takes matters, for the reason on DUMMY_HASH.
    await compareOrFalse(plain, DUMMY_HASH);
    return false;
  }

  return compareOrFalse(plain, hash);
}

/**
 * bcrypt's comparison, with a hash the library cannot parse answered as a mismatch.
 *
 * bcryptjs resolves false for a stored value of the wrong length, but it throws for one that is
 * exactly 60 characters of the wrong shape: "Invalid salt version" for anything not opening
 * $2a$, $2b$ or $2y$, "Invalid salt revision" for a version it does not know, "Illegal number of
 * rounds" for a cost outside 4 to 31. Letting that escape would undo the work above. A sign-in
 * that throws for one address and returns a clean error key for every other address answers the
 * enumeration question by which one broke, and the throw also skips whatever the caller does on a
 * failed attempt, so a corrupt row would stop counting against the throttle.
 *
 * A row this file cannot read is an account that cannot sign in, which is the same answer as a
 * wrong password, so false is not a guess: it is the only truthful reading of an unusable hash.
 */
async function compareOrFalse(plain: string, hash: string): Promise<boolean> {
  try {
    return await compare(plain, hash);
  } catch {
    return false;
  }
}

/**
 * Whether a hash that has just verified was made below the cost this file now writes.
 *
 * A caller that gets true on a successful sign-in holds the one thing needed to fix the row: the
 * plaintext. Rehashing it there and storing the result is the only moment that ever exists, and it
 * buys two things. The obvious one is that the account stops sitting behind a cheaper hash than
 * the policy asks for. The one that is easy to miss is the timing gap named on DUMMY_HASH: a wrong
 * password against a cost 10 row answers in about 60ms where the dummy spends about 250ms at cost
 * 12, so until the last legacy hash is upgraded, being fast is itself the signal that an address
 * has an account behind it. This drains that population one sign-in at a time.
 *
 * A hash bcryptjs cannot read yields NaN, and NaN is not less than anything, so it reads false. A
 * row this file cannot parse is not a row to quietly overwrite.
 */
export function needsRehash(hash: string | null | undefined): boolean {
  return hash ? getRounds(hash) < BCRYPT_COST : false;
}
