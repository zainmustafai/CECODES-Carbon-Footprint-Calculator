import { afterEach, describe, expect, it, vi } from "vitest";

// throttle-policy.test.ts covers the pure arithmetic (window expiry, lockout math) with no
// database involved. sign-in-throttle.test.ts (src/features/auth/actions/__tests__) drives this
// module's non-empty-keys path end to end through the real signInAction, against an in-memory
// stand-in for prisma.authThrottle, and that already exercises every branch reachable with a real
// key list, because signInThrottleKeys/passwordResetThrottleKeys always produce at least the
// address key.
//
// What neither of those reaches is the one thing this file is for: the `keys.length === 0` guard
// at the top of each of the three storage functions. Nothing in this codebase currently calls them
// with an empty array (both key builders always include the address key), but the guard is real
// defensive code, not dead code: these are the module's only public entry points, callable with any
// string[], and the behaviour it buys is concrete - a caller that ends up with no keys (say, a
// future call site that filters keys down before checking) gets an answer with no round trip to
// Postgres, instead of an `IN ()` query. That is worth asserting directly: not just that the
// functions resolve, but that they resolve WITHOUT touching prisma at all.

const findMany = vi.fn();
const upsert = vi.fn();
const deleteMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    authThrottle: {
      findMany: (...args: unknown[]) => findMany(...(args as [])),
      upsert: (...args: unknown[]) => upsert(...(args as [])),
      deleteMany: (...args: unknown[]) => deleteMany(...(args as [])),
    },
  },
}));

const { isSignInThrottled, recordSignInFailure, clearSignInThrottle } = await import(
  "../throttle"
);

afterEach(() => {
  findMany.mockReset();
  upsert.mockReset();
  deleteMany.mockReset();
});

describe("an empty key list is a no-op, not an empty-IN query", () => {
  it("isSignInThrottled reads false with no key list, without querying the store", async () => {
    expect(await isSignInThrottled([])).toBe(false);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("recordSignInFailure with no key list writes nothing", async () => {
    await recordSignInFailure([]);
    expect(findMany).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("clearSignInThrottle with no key list deletes nothing", async () => {
    await clearSignInThrottle([]);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
