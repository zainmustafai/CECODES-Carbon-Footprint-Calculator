import { z } from "zod";

// The server's own copy of the auth rules. IMPLEMENTATION.md §8: "the server re-validates with
// its own schema and never trusts the client's". Every tenant action already did this; the auth
// actions did not, which meant the documented password policy lived only in the browser and a
// direct POST to updatePasswordAction fell through to Supabase's own 6-character floor.
//
// These schemas carry no messages. Auth errors return opaque i18n keys (never sentences, never
// field-level detail), so there is nothing here for a translator to phrase: a rejection is always
// just "invalidInput". That also keeps them free of the translator argument the client factories
// in auth-schemas.ts need, which is why they are separate objects rather than a shared base.
//
// Every object is .strict(): an unexpected key is a rejection, not a silently dropped field, so
// no hand-crafted request can smuggle an extra property through to a Supabase call.

/** The one place the password policy is written down. Both sides of the boundary import it. */
export const PASSWORD_MIN = 8;

/**
 * bcrypt hashes at most 72 bytes and silently ignores the rest, so without this a 100-character
 * password would be accepted, stored as a hash of its first 72 characters, and then satisfied
 * later by typing only those 72. The user would believe they had a longer secret than they do.
 *
 * Enforced where a password is SET, never where one is checked: signInInput deliberately omits
 * it, for the same reason it omits PASSWORD_MIN. An account created before this rule may hold a
 * longer password, and rejecting it at sign-in would lock out the very people it was meant to
 * protect. bcrypt still truncates on verification, so they continue to sign in normally.
 */
export const PASSWORD_MAX = 72;

/**
 * The longest address anyone may present, anywhere.
 *
 * 254 is the practical ceiling on a deliverable address (RFC 5321 caps the reverse path at 256
 * including the angle brackets), so nothing real is refused by it. What it refuses is the thing
 * an unbounded z.email() lets through: a multi-kilobyte local part.
 *
 * That is not a cosmetic bound. auth_throttle.key is a TEXT PRIMARY KEY, so it is a btree entry
 * capped at 2704 bytes, and signInThrottleKeys builds it as "email:" plus the address. A 3000
 * character address therefore made recordSignInFailure raise 54000 out of an unauthenticated
 * endpoint AFTER the full quarter second of bcrypt had already been spent, and the failed write
 * meant the attempt was never counted. Bounding the address here is what keeps the counter, the
 * key and the request body all finite.
 */
export const EMAIL_MAX = 254;

/**
 * The bound on a password being CHECKED rather than set.
 *
 * Deliberately far above PASSWORD_MAX and not equal to it: an account created before that rule
 * may hold a longer password, and refusing it here would lock out the very people the rule was
 * written to protect (bcrypt reads the first 72 bytes either way, so they still sign in). The
 * only job of this number is that a megabyte of text is refused before anything hashes it.
 */
const CHECKED_PASSWORD_MAX = 1024;

const email = z.string().trim().min(1).max(EMAIL_MAX).email();
const password = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);

/** A password offered as proof, not stored. See CHECKED_PASSWORD_MAX for why the two differ. */
const checkedPassword = z.string().min(1).max(CHECKED_PASSWORD_MAX);

export const signInInput = z
  .object({
    email,
    // Not PASSWORD_MIN: an existing account may predate the policy, and rejecting a short
    // password here would leak that the stored one is short. Length is enforced where a password
    // is SET, not where it is checked.
    password: checkedPassword,
  })
  .strict();

export const signUpInput = z.object({ email, password }).strict();

export const emailInput = email;

export const passwordInput = password;

export const checkedPasswordInput = checkedPassword;
