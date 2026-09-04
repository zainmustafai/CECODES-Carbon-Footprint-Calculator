// The shape check behind scripts/audit-password-hashes.ts, pulled out of that script and into
// src/lib so it lives beside password.ts (what actually verifies a hash) and can be exercised by
// the ordinary test suite rather than only by a one-off run of the script itself. The script
// still owns the database query and the printing; this file owns only the classification rule
// that every count in that printout rests on.

// $2a$ is what GoTrue produced; $2b$ is what bcryptjs produces now. $2y$ is a third bcrypt-
// compatible prefix (seen from PHP's crypt_blowfish, among others) that bcryptjs's own compare()
// also accepts, per its error message for anything else: "Invalid salt version". Recognizing it
// here matches what verifyPassword in password.ts would actually accept, not a stricter or looser
// rule of this file's own invention. All three are 60 characters with a two-digit cost. Anything
// else cannot be verified and would lock its owner out silently.
const WELL_FORMED = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export type HashClass = "well-formed" | "missing" | "malformed";

/**
 * Classifies one stored `passwordHash` value with no side effects: no database, no I/O, no
 * randomness. This is the one rule the audit's counts rest on, so it is tested directly, against
 * a table of hash shapes, without needing a database connection.
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
 * The algorithm and cost prefix of a well-formed hash, for example "$2a$12$": always exactly 7
 * characters. Never call this on anything classifyHash did not already call "well-formed"; it
 * assumes the hash is at least that long.
 */
export function costPrefix(hash: string): string {
  return hash.slice(0, 7);
}
