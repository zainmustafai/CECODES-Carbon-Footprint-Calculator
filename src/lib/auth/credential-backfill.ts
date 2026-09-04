// Which accounts the credential backfill writes a password for, and which it refuses.
//
// This is the decision half of prisma/backfill-auth-credentials.ts, with no database, no pg
// client and no terminal. It lives here rather than in the script for one reason: the script is a
// top-level `main()` that connects to two clients on import, so nothing could exercise these rules
// without a live Supabase project, and they are the rules that decide who can sign in on cutover
// day. A mistake in them is discovered by users being locked out, which is the worst possible
// place to discover it.
//
// The write itself stays in the script, and so does the one guarantee that cannot be expressed
// here: `passwordHash: null` sits in the WHERE of the updateMany, so "never overwrite a password"
// is a property of the statement and not only of this classification.

/** One row of Supabase's auth.users, reduced to what the decision reads. */
export type AuthAccount = {
  id: string;
  email: string | null;
  encryptedPassword: string | null;
  emailConfirmedAt: Date | null;
  lastSignInAt: Date | null;
  /** Banned or soft-deleted in GoTrue. Computed in SQL; see the query for why. */
  revoked: boolean;
};

/** One row of app_users, reduced the same way. */
export type ProfileAccount = {
  id: string;
  email: string;
  passwordHash: string | null;
};

/** A row the backfill intends to write, once an operator passes --apply. */
export type PlannedWrite = {
  id: string;
  passwordHash: string;
  emailConfirmedAt: Date | null;
  lastSignInAt: Date | null;
};

/**
 * Every id the run has something to say about, grouped by the reason it was said.
 *
 * Each id appears in exactly ONE of these lists, except emailMismatch, which is an observation
 * about a row rather than a verdict on it and therefore rides alongside whatever else was decided.
 */
export type BackfillPlan = {
  planned: PlannedWrite[];
  /** Matched on id, already holds a password. Left completely alone, including lastSignInAt. */
  skippedAlreadySet: string[];
  /** Matched on id, but banned or deleted in GoTrue. Deliberately left with no password. */
  skippedRevoked: string[];
  /** Matched on id, but auth.users holds no password to copy. */
  missingHash: string[];
  /** Matched on id, but the stored value is not a bcrypt hash this app can read. */
  skippedUnknownAlgo: string[];
  /** A GoTrue account with no app_users row. Cannot sign in after the cutover. */
  authWithoutProfile: string[];
  /** An app_users row with no GoTrue account. Nothing to copy from. */
  profileWithoutAuth: string[];
  /** Matched on id, but the two tables spell the address differently. */
  emailMismatch: string[];
};

/**
 * The shape GoTrue writes: $2a$/$2b$/$2y$, a two digit cost, then 53 characters of salt and digest.
 *
 * Checked per row even though the Phase 0 audit found every hash to be $2a$ and 60 characters,
 * because this script writes passwordAlgo = "bcrypt" as a statement of fact. Copying anything else
 * under that label produces a row that cannot authenticate and carries no clue as to why:
 * verifyPassword refuses an algo it does not implement rather than guessing at the bytes.
 */
export const BCRYPT_HASH_BODY = String.raw`\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}`;

const BCRYPT_HASH = new RegExp(`^${BCRYPT_HASH_BODY}$`);

/**
 * Classifies every account on both sides. Pure: same inputs, same plan, no clock and no writes.
 *
 * The order of the checks is the safety argument, and it is why they are a chain rather than a set
 * of independent filters. A row is counted under the FIRST reason that applies and no other:
 *
 *   revoked before everything, so an account somebody deliberately switched off is never filed as
 *   a routine skip and never picks up a password on the way through. Refusing to copy is the safe
 *   direction; the worst case is a real person who has to be given a password by hand.
 *
 *   already-set before the credential checks, and it skips the WHOLE row rather than just the hash
 *   column, because lastSignInAt is maintained by the app once sign-in runs here and rewriting it
 *   from a frozen copy of auth.users would move a live fact backwards.
 *
 * Matching is on id and only on id. Both tables were built with the same uuids, so the id is the
 * real key; email is a weaker one that can drift (a change applied on one side, a difference in
 * case or whitespace), and pairing on it would hand one person's password to another person's
 * profile with nothing looking wrong. The address is read to REPORT a mismatch and never to match.
 */
export function planCredentialBackfill(
  authAccounts: readonly AuthAccount[],
  profiles: readonly ProfileAccount[],
): BackfillPlan {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const authIds = new Set(authAccounts.map((account) => account.id));

  const plan: BackfillPlan = {
    planned: [],
    skippedAlreadySet: [],
    skippedRevoked: [],
    missingHash: [],
    skippedUnknownAlgo: [],
    authWithoutProfile: [],
    profileWithoutAuth: [],
    emailMismatch: [],
  };

  for (const account of authAccounts) {
    const profile = profileById.get(account.id);
    if (!profile) {
      plan.authWithoutProfile.push(account.id);
      continue;
    }

    if (account.email && normalize(profile.email) !== normalize(account.email)) {
      plan.emailMismatch.push(account.id);
    }

    if (account.revoked) {
      plan.skippedRevoked.push(account.id);
      continue;
    }

    if (profile.passwordHash !== null) {
      plan.skippedAlreadySet.push(account.id);
      continue;
    }

    const hash = account.encryptedPassword?.trim() ?? "";
    if (hash === "") {
      plan.missingHash.push(account.id);
      continue;
    }
    if (!BCRYPT_HASH.test(hash)) {
      plan.skippedUnknownAlgo.push(account.id);
      continue;
    }

    plan.planned.push({
      id: account.id,
      passwordHash: hash,
      emailConfirmedAt: account.emailConfirmedAt,
      lastSignInAt: account.lastSignInAt,
    });
  }

  for (const profile of profiles) {
    if (!authIds.has(profile.id)) plan.profileWithoutAuth.push(profile.id);
  }

  return plan;
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}
