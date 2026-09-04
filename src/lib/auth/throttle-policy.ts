// The sign-in throttle's arithmetic, with no clock and no database of its own.
//
// Why any of this exists: nothing else counts. A password is a bcrypt hash in app_users and a
// sign-in is verified in this process, so there is no provider behind the app with brute-force
// protection of its own. This module is not a second line of defence, it is the only one, and a
// gap here is not softened by anything.
//
// It was never much more than that. Every sign-in goes through a Server Action, so the hosted
// provider this replaced saw one source IP - the server's - for every user of the app, and its
// per-IP protection was therefore pooled across the whole tenant base, which is the same as not
// having it. Removing that provider did not weaken the case for counting here; it removed the
// last reason anyone might think something upstream would catch what this misses.
//
// Keeping the arithmetic separate from storage is what makes the windows and lockouts testable
// without a database, and keeps throttle.ts down to reading a row, applying a function, and
// writing it back.

/** How long a run of failures is remembered. Failures older than this do not count. */
export const WINDOW_MS = 15 * 60 * 1000;

/** Failures allowed against ONE email address inside one window before it is locked. */
export const MAX_ATTEMPTS = 5;

/**
 * Failures allowed against one IP address, which is deliberately looser.
 *
 * A member company reaches this app from its office, so its whole staff shares one address. At
 * the per-address limit, five typos spread across thirty colleagues would lock the building out
 * of the tool for fifteen minutes, and the support call that follows lands on CECODES. The IP key
 * is not there to protect one account anyway - the email key does that, and it is unaffected by
 * this number. It is there to stop one machine working through many accounts, and twenty failures
 * against different addresses in fifteen minutes is not a person mistyping.
 */
export const IP_MAX_ATTEMPTS = 20;

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
export function registerFailure(
  state: ThrottleState | null,
  now: Date,
  maxAttempts: number = MAX_ATTEMPTS,
): ThrottleState {
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
      attempts >= maxAttempts ? new Date(now.getTime() + LOCKOUT_MS) : state.lockedUntil,
  };
}
