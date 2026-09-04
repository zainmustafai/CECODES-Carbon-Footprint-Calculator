// The sign-in throttle's arithmetic, with no clock and no database of its own.
//
// Why any of this exists: every sign-in goes through a Server Action, so Supabase sees one source
// IP - the server's - for every user of the app. Its per-IP brute-force protection is therefore
// pooled across the whole tenant base, which is the same as not having it. The counting has to
// happen on this side of that call, before the password is ever forwarded.
//
// Keeping the arithmetic separate from storage is what makes the windows and lockouts testable
// without a database, and keeps throttle.ts down to reading a row, applying a function, and
// writing it back.

/** How long a run of failures is remembered. Failures older than this do not count. */
export const WINDOW_MS = 15 * 60 * 1000;

/** Failures allowed inside one window before the key is locked. */
export const MAX_ATTEMPTS = 5;

/** How long a locked key stays locked. */
export const LOCKOUT_MS = 15 * 60 * 1000;

export type ThrottleState = {
  attempts: number;
  windowStartedAt: Date;
  /** When the lock lifts, or null if the key is not locked. */
  lockedUntil: Date | null;
};

export function isLockedOut(state: ThrottleState | null, now: Date): boolean {
  return state?.lockedUntil != null && state.lockedUntil.getTime() > now.getTime();
}

/**
 * The state after one more failed attempt.
 *
 * A window that has run out, or a lock that has lifted, starts the count over: someone who comes
 * back an hour later and mistypes once has not "used up" an attempt from before, and a released
 * lock that relocked on a single failure would turn a fifteen minute penalty into a permanent one.
 */
export function registerFailure(state: ThrottleState | null, now: Date): ThrottleState {
  const fresh: ThrottleState = { attempts: 1, windowStartedAt: now, lockedUntil: null };
  if (!state) return fresh;

  const lockExpired = state.lockedUntil != null && state.lockedUntil.getTime() <= now.getTime();
  const windowExpired = now.getTime() - state.windowStartedAt.getTime() > WINDOW_MS;
  if (lockExpired || windowExpired) return fresh;

  const attempts = state.attempts + 1;
  return {
    attempts,
    windowStartedAt: state.windowStartedAt,
    lockedUntil:
      attempts >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MS) : state.lockedUntil,
  };
}
