import { describe, expect, it } from "vitest";
import {
  LOCKOUT_MS,
  MAX_ATTEMPTS,
  WINDOW_MS,
  isLockedOut,
  registerFailure,
  type ThrottleState,
} from "../throttle-policy";

// Every sign-in reaches Supabase from one server, so Supabase sees a single source IP for the
// whole tenant base and its per-IP brute-force protection is pooled across all of them, which is
// to say defeated. The counting lives here instead. This is the pure half: no clock, no database,
// so the window and lockout arithmetic is testable at a millisecond.

const T0 = new Date("2026-09-04T12:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

/** Fails `count` times in a row, starting at T0, one millisecond apart. */
function failRepeatedly(count: number, from = T0): ThrottleState {
  let state: ThrottleState | null = null;
  for (let i = 0; i < count; i++) {
    state = registerFailure(state, new Date(from.getTime() + i));
  }
  return state as ThrottleState;
}

describe("registerFailure", () => {
  it("starts a window on the first failure", () => {
    const state = registerFailure(null, T0);
    expect(state.attempts).toBe(1);
    expect(state.windowStartedAt).toEqual(T0);
    expect(state.lockedUntil).toBeNull();
  });

  it("does not lock before the allowed number of attempts is used up", () => {
    const state = failRepeatedly(MAX_ATTEMPTS - 1);
    expect(state.lockedUntil).toBeNull();
    expect(isLockedOut(state, T0)).toBe(false);
  });

  it("locks out once the allowed attempts are exhausted inside the window", () => {
    const state = failRepeatedly(MAX_ATTEMPTS);
    expect(state.lockedUntil).not.toBeNull();
    expect(isLockedOut(state, T0)).toBe(true);
  });

  it("forgets attempts that fall outside the window, so slow guessing never accumulates", () => {
    const stale = failRepeatedly(MAX_ATTEMPTS - 1);
    const state = registerFailure(stale, at(WINDOW_MS + 1));
    expect(state.attempts).toBe(1);
    expect(isLockedOut(state, at(WINDOW_MS + 1))).toBe(false);
  });

  it("gives a full fresh window after a lockout expires, rather than relocking on one failure", () => {
    const locked = failRepeatedly(MAX_ATTEMPTS);
    const after = new Date(locked.lockedUntil!.getTime() + 1);
    const state = registerFailure(locked, after);
    expect(state.attempts).toBe(1);
    expect(state.lockedUntil).toBeNull();
  });
});

describe("isLockedOut", () => {
  it("treats a key that has never failed as free", () => {
    expect(isLockedOut(null, T0)).toBe(false);
  });

  it("holds the lock right up to the moment it expires", () => {
    const state = failRepeatedly(MAX_ATTEMPTS);
    const justBefore = new Date(state.lockedUntil!.getTime() - 1);
    expect(isLockedOut(state, justBefore)).toBe(true);
  });

  it("releases the lock once it expires", () => {
    const state = failRepeatedly(MAX_ATTEMPTS);
    expect(isLockedOut(state, state.lockedUntil!)).toBe(false);
    expect(isLockedOut(state, new Date(state.lockedUntil!.getTime() + 1))).toBe(false);
  });

  it("locks for the configured lockout period, measured from the failure that tripped it", () => {
    const state = failRepeatedly(MAX_ATTEMPTS);
    const trippedAt = T0.getTime() + MAX_ATTEMPTS - 1;
    expect(state.lockedUntil!.getTime() - trippedAt).toBe(LOCKOUT_MS);
  });
});
