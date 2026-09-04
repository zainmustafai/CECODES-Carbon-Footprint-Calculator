import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashSync } from "bcryptjs";
import { BCRYPT_COST, PASSWORD_ALGO } from "@/lib/auth/password";

// AUTH_PROVIDER=shadow, and specifically the log line that is the whole reason shadow mode exists.
//
// Shadow mode changes no outcome. Its entire product is one report, written when the local hash
// and GoTrue disagree about a password, and the cutover decision is "that report stayed quiet for
// a fortnight". Nothing exercised it: a swallowed throw, an inverted comparison, or a `select`
// that stopped returning passwordHash would all fail SILENTLY, and silence is indistinguishable
// from the success it is supposed to signal. An operator would read a clean log and cut over onto
// a table of hashes nobody had actually checked.
//
// So there are four things to hold, and only the first is obvious:
//   - agreement writes nothing,
//   - disagreement writes exactly one report, in BOTH directions,
//   - an address GoTrue holds and app_users does not is itself a disagreement worth reporting,
//   - and none of it, including a throw from inside, can change the sign-in GoTrue decided.

const findUnique = vi.fn();
const authThrottle = {
  findMany: vi.fn(async () => []),
  upsert: vi.fn(async () => ({})),
  deleteMany: vi.fn(async () => ({ count: 0 })),
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appUser: { findUnique: (...args: unknown[]) => findUnique(...(args as [])) },
    get authThrottle() {
      return authThrottle;
    },
  },
}));

const signInWithPassword = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signInWithPassword: (...a: unknown[]) => signInWithPassword(...(a as [])), signOut: async () => ({}) },
  }),
}));

const reportError = vi.fn();
vi.mock("@/lib/observability/report-error", () => ({
  reportError: (report: unknown) => reportError(report),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", "10.0.0.1"]]),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

const { signInAction } = await import("../auth-actions");

const EMAIL = "persona@empresa.com";
const PASSWORD = "una contrasena valida";
const USER_ID = "user-1";
/** Real, at the real cost: a stubbed compare would let every case below pass on nothing. */
const HASH = hashSync(PASSWORD, BCRYPT_COST);

/** The row app_users holds for this address, or null for an address it has never heard of. */
function profile(overrides: Partial<{ passwordHash: string | null; passwordAlgo: string | null }> = {}) {
  findUnique.mockImplementation(async ({ select }: { select?: Record<string, unknown> }) => {
    // signInThroughSupabase looks the profile up a second time, for `active`, and that read must
    // not be answered with credential columns.
    if (select?.active) return { active: true };
    return { id: USER_ID, passwordHash: HASH, passwordAlgo: PASSWORD_ALGO, ...overrides };
  });
}

function gotrueAccepts(accepted: boolean) {
  signInWithPassword.mockResolvedValue(
    accepted
      ? { data: { user: { id: USER_ID } }, error: null }
      : { data: {}, error: { message: "Invalid login credentials" } },
  );
}

/** The one report shadow mode is for, as opposed to the catch-all it also writes. */
function verdicts() {
  return reportError.mock.calls
    .map(([report]) => report as { where: string; context?: Record<string, unknown> })
    .filter((report) => report.where === "auth/shadow-verdict");
}

beforeEach(() => {
  vi.clearAllMocks();
  authThrottle.findMany.mockResolvedValue([]);
  profile();
  vi.stubEnv("AUTH_PROVIDER", "shadow");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("recordShadowVerdict", () => {
  it("says nothing when the two stores agree that the password is right", async () => {
    gotrueAccepts(true);

    expect(await signInAction({ email: EMAIL, password: PASSWORD })).toEqual({});

    // Silence is the result worth having: it is what an operator reads to decide the cutover.
    expect(verdicts()).toHaveLength(0);
  });

  it("says nothing when the two stores agree that the password is wrong", async () => {
    gotrueAccepts(false);

    expect(await signInAction({ email: EMAIL, password: "otra contrasena" })).toEqual({
      error: "invalidCredentials",
    });

    expect(verdicts()).toHaveLength(0);
  });

  it("reports the backfill being wrong: GoTrue accepts, the local hash does not", async () => {
    // The failure this mode exists to catch. Cut over without seeing it and this person cannot
    // sign in on the day the flag flips, with nothing in the logs saying why.
    profile({ passwordHash: hashSync("what the backfill copied", BCRYPT_COST) });
    gotrueAccepts(true);

    expect(await signInAction({ email: EMAIL, password: PASSWORD })).toEqual({});

    const [report] = verdicts();
    expect(report).toBeDefined();
    expect(report!.context).toEqual({
      userId: USER_ID,
      supabaseAccepted: true,
      localAccepted: false,
    });
  });

  it("reports the other direction too, where the local hash is the stale one", async () => {
    // A password rotated in GoTrue without the mirror landing. Cutting over would reinstate the
    // password the user retired, which is worse than locking them out.
    gotrueAccepts(false);

    expect(await signInAction({ email: EMAIL, password: PASSWORD })).toEqual({
      error: "invalidCredentials",
    });

    expect(verdicts()[0]?.context).toEqual({
      userId: USER_ID,
      supabaseAccepted: false,
      localAccepted: true,
    });
  });

  it("reports a null id when GoTrue holds an account app_users has never heard of", async () => {
    // No amount of rehashing fixes this one, which is why it carries a null rather than being
    // filtered out as "nothing to compare".
    findUnique.mockResolvedValue(null);
    gotrueAccepts(true);

    expect(await signInAction({ email: EMAIL, password: PASSWORD })).toEqual({});

    expect(verdicts()[0]?.context).toEqual({
      userId: null,
      supabaseAccepted: true,
      localAccepted: false,
    });
  });

  it("carries the id and never the address, because that is the fact these logs must not hold", async () => {
    profile({ passwordHash: hashSync("something else", BCRYPT_COST) });
    gotrueAccepts(true);

    await signInAction({ email: EMAIL, password: PASSWORD });

    expect(JSON.stringify(verdicts())).not.toContain(EMAIL);
  });

  it("cannot refuse a sign-in Supabase accepted, even when the observation itself throws", async () => {
    // An observation that can change an outcome is worse than no observation: it would be
    // discovered by users rather than by this log. The whole body is wrapped for that reason, and
    // nothing proved the wrapping held.
    findUnique.mockRejectedValue(new Error("column app_users.password_hash does not exist"));
    gotrueAccepts(true);

    expect(await signInAction({ email: EMAIL, password: PASSWORD })).toEqual({});

    expect(verdicts()).toHaveLength(1);
  });

  it("is not written at all under the provider that is not rehearsing anything", async () => {
    vi.stubEnv("AUTH_PROVIDER", "supabase");
    profile({ passwordHash: hashSync("a hash that disagrees", BCRYPT_COST) });
    gotrueAccepts(true);

    expect(await signInAction({ email: EMAIL, password: PASSWORD })).toEqual({});

    expect(verdicts()).toHaveLength(0);
  });
});
