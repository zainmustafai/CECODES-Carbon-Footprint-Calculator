import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compareSync } from "bcryptjs";

// ADMIN USER MANAGEMENT UNDER AUTH_PROVIDER=local.
//
// action-authorization.test.ts proves these actions refuse a caller who is not an admin, but it
// runs with AUTH_PROVIDER unset, so it only ever walks the Supabase branch. Every `local` branch
// added by the credential migration was reachable in production and by nothing in this suite: the
// single INSERT that replaces the GoTrue create, and the two transactions that are supposed to
// end a rotated or deactivated account's other credentials.
//
// What is asserted here is what a reader cannot check by eye: that rotating a password revokes
// everything that could still open the account (sessions AND outstanding reset links) rather than
// only the ones that are easy to see, that a deactivation does the same, that reactivation revokes
// nothing, and that the Supabase branch is untouched so AUTH_PROVIDER=supabase remains a real
// rollback.
//
// Real bcrypt, because a stubbed hash would let this file pass while the column held anything at
// all. Prisma is a spy per method: the assertions are about which statements ran, with which
// scope, inside which transaction.

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";
const TARGET_EMAIL = "persona@empresa.co";
const COMPANY_ID = "33333333-3333-4333-8333-333333333333";

const ADMIN = {
  id: ADMIN_ID,
  email: "admin@cecodes.org",
  role: "CECODES_ADMIN" as const,
  companyId: null,
  active: true,
};

/** The shape of the scoped writes these actions make, and the only part the fakes read. */
type WriteArgs = { where: Record<string, unknown>; data?: Record<string, unknown> };

const appUser = {
  findUnique: vi.fn(),
  create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
  upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => create),
  // Keyed on an id, so one row matches. A write that arrived unscoped would report zero and fail
  // the count check in the action, which is the behaviour worth having in a fake.
  updateMany: vi.fn(async ({ where }: WriteArgs) => ({ count: where.id ? 1 : 0 })),
  deleteMany: vi.fn(async ({ where }: WriteArgs) => ({ count: where.id ? 1 : 0 })),
};
const company = { findUnique: vi.fn(async () => ({ id: COMPANY_ID })) };
const userSession = { deleteMany: vi.fn(async () => ({ count: 2 })) };
const passwordResetToken = { deleteMany: vi.fn(async () => ({ count: 1 })) };
const authThrottle = { deleteMany: vi.fn(async () => ({ count: 1 })) };

// The interactive form, running its callback against the same spies. An array-only fake would
// never run the body, so a guard deleted from inside a transaction would go unnoticed.
const transaction = vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run(prismaFake));

const prismaFake = {
  appUser,
  company,
  userSession,
  passwordResetToken,
  authThrottle,
  $transaction: transaction,
};

vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return prismaFake;
  },
}));

const supabaseCreateUser = vi.fn(async () => ({
  data: { user: { id: TARGET_ID } },
  error: null,
}));
const supabaseUpdateUserById = vi.fn(async () => ({ error: null }));
const supabaseDeleteUser = vi.fn(async () => ({ error: null }));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    auth: {
      admin: {
        createUser: supabaseCreateUser,
        updateUserById: supabaseUpdateUserById,
        deleteUser: supabaseDeleteUser,
      },
    },
  }),
  findAuthUserIdByEmail: vi.fn(),
}));

let currentUser: typeof ADMIN | null = ADMIN;
vi.mock("@/lib/auth/server", () => ({
  getAppUser: async () => currentUser,
  getUser: async () => (currentUser ? { id: currentUser.id, email: currentUser.email } : null),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actions = await import("@/features/admin/actions/user-actions");

/** The env is read per call by authProvider(), so a test only has to set it. */
const originalProvider = process.env.AUTH_PROVIDER;
const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  currentUser = ADMIN;
  appUser.findUnique.mockResolvedValue({ id: TARGET_ID, email: TARGET_EMAIL });
  process.env.AUTH_PROVIDER = "local";
  // A self-hosted deployment with no Supabase project at all: the delete path must not reach for
  // one. The rollback case sets these back on for the test that needs them.
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => {
  process.env.AUTH_PROVIDER = originalProvider;
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
});

/** The hash written by whichever appUser statement ran, so the column is checked and not assumed. */
function writtenHash(call: { data?: Record<string, unknown> }): string {
  return String(call.data?.passwordHash ?? "");
}

describe("createUser in local mode", () => {
  it("writes one row carrying a usable hash, and never asks GoTrue", async () => {
    const result = await actions.createUser({
      email: "Nueva@Empresa.CO",
      tempPassword: "temporal-1234",
      role: "COMPANY_USER",
      companyId: COMPANY_ID,
    });

    expect(result.error).toBeUndefined();
    expect(supabaseCreateUser).not.toHaveBeenCalled();
    expect(appUser.upsert).not.toHaveBeenCalled();

    const data = appUser.create.mock.calls[0][0].data;
    // Canonical casing, or the sign-in lookup (which lowercases) would never reach this row.
    expect(data.email).toBe("nueva@empresa.co");
    expect(data.active).toBe(true);
    expect(compareSync("temporal-1234", writtenHash({ data }))).toBe(true);
  });

  it("reports a duplicate address as emailInUse rather than leaking the driver's error", async () => {
    appUser.create.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));

    const result = await actions.createUser({
      email: "repetida@empresa.co",
      tempPassword: "temporal-1234",
      role: "COMPANY_USER",
      companyId: COMPANY_ID,
    });

    expect(result).toEqual({ error: "emailInUse" });
  });
});

describe("resetUserPassword in local mode", () => {
  it("stores the new hash and ends every session, in one transaction", async () => {
    const result = await actions.resetUserPassword({
      userId: TARGET_ID,
      tempPassword: "nueva-clave-1",
    });

    expect(result).toEqual({});
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(supabaseUpdateUserById).not.toHaveBeenCalled();
    expect(compareSync("nueva-clave-1", writtenHash(appUser.updateMany.mock.calls[0][0]))).toBe(
      true,
    );
    expect(userSession.deleteMany).toHaveBeenCalledWith({ where: { userId: TARGET_ID } });
  });

  it("also destroys outstanding reset links, which are credentials of the same standing", async () => {
    // The attack this closes: an emailed link already sitting in a mailbox the admin is rotating
    // the password to lock out of. It survives the rotation and buys its holder one password
    // change of their own choosing.
    await actions.resetUserPassword({ userId: TARGET_ID, tempPassword: "nueva-clave-1" });

    expect(passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { userId: TARGET_ID } });
  });

  it("lifts the lockout on the address, so the credentials it just issued can be used", async () => {
    // Five wrong guesses hold the ADDRESS for fifteen minutes, and the hold is checked before any
    // password is. Without this the admin is told the rotation worked while the person they
    // dictated it to still cannot sign in.
    await actions.resetUserPassword({ userId: TARGET_ID, tempPassword: "nueva-clave-1" });

    expect(authThrottle.deleteMany).toHaveBeenCalledWith({
      where: { key: { in: [`email:${TARGET_EMAIL}`] } },
    });
  });

  it("refuses an admin rotating their own password, and writes nothing", async () => {
    const result = await actions.resetUserPassword({
      userId: ADMIN_ID,
      tempPassword: "nueva-clave-1",
    });

    expect(result).toEqual({ error: "cannotEditSelf" });
    expect(appUser.updateMany).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(authThrottle.deleteMany).not.toHaveBeenCalled();
  });
});

describe("setUserActive", () => {
  it("deactivating ends the sessions and the reset links together with the flag", async () => {
    const result = await actions.setUserActive({ userId: TARGET_ID, active: false });

    expect(result).toEqual({});
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(userSession.deleteMany).toHaveBeenCalledWith({ where: { userId: TARGET_ID } });
    // A link issued before the deactivation would otherwise still set a password, and that
    // attacker-chosen password is what governs the day the account is let back in.
    expect(passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { userId: TARGET_ID } });
  });

  it("reactivating revokes nothing, because everything left belongs to the person returning", async () => {
    const result = await actions.setUserActive({ userId: TARGET_ID, active: true });

    expect(result).toEqual({});
    expect(userSession.deleteMany).not.toHaveBeenCalled();
    expect(passwordResetToken.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses a row that is not there instead of reporting a write that touched nobody", async () => {
    appUser.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await actions.setUserActive({ userId: TARGET_ID, active: false });

    expect(result).toEqual({ error: "forbidden" });
  });

  it("sweeps under the Supabase providers too, so a rollback cannot revive the sessions", async () => {
    // Same argument as the rotation: these rows decide nothing under `supabase`, and they decide
    // everything again the moment AUTH_PROVIDER goes back to `local`. A user deactivated during
    // the Supabase window must not come back holding a live cookie.
    process.env.AUTH_PROVIDER = "supabase";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";

    expect(await actions.setUserActive({ userId: TARGET_ID, active: false })).toEqual({});

    expect(userSession.deleteMany).toHaveBeenCalledWith({ where: { userId: TARGET_ID } });
    expect(passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { userId: TARGET_ID } });
  });
});

// The self-lockout guards. CECODES runs one admin: an admin who demotes, deactivates or deletes
// themselves locks the organisation out of its own admin area with no way back except SQL, because
// there is no self-serve registration and nobody left who can create an account. Only
// resetUserPassword's guard had a test; these three had none, and each is one line in the action.
describe("an admin cannot lock themselves out", () => {
  it("refuses to change their own role or company", async () => {
    const result = await actions.updateUser({
      userId: ADMIN_ID,
      role: "COMPANY_USER",
      companyId: COMPANY_ID,
    });

    expect(result).toEqual({ error: "cannotEditSelf" });
    expect(appUser.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to deactivate themselves", async () => {
    const result = await actions.setUserActive({ userId: ADMIN_ID, active: false });

    expect(result).toEqual({ error: "cannotEditSelf" });
    expect(transaction).not.toHaveBeenCalled();
    expect(appUser.updateMany).not.toHaveBeenCalled();
    expect(userSession.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses to delete themselves", async () => {
    const result = await actions.deleteUser({ userId: ADMIN_ID });

    expect(result).toEqual({ error: "cannotEditSelf" });
    expect(appUser.deleteMany).not.toHaveBeenCalled();
    expect(supabaseDeleteUser).not.toHaveBeenCalled();
  });

  it("still lets them act on somebody else", async () => {
    // The guard has to be an identity check and not a blanket refusal, or the screen it protects
    // would do nothing at all.
    expect(await actions.setUserActive({ userId: TARGET_ID, active: false })).toEqual({});
  });
});

describe("deleteUser in local mode", () => {
  it("deletes the profile without reaching for a Supabase project that does not exist", async () => {
    const result = await actions.deleteUser({ userId: TARGET_ID });

    expect(result).toEqual({});
    expect(supabaseDeleteUser).not.toHaveBeenCalled();
    expect(appUser.deleteMany).toHaveBeenCalledWith({ where: { id: TARGET_ID } });
  });

  it("still removes the GoTrue account while one is configured, so a rollback cannot resurrect it", async () => {
    // Inside the cutover window GoTrue is still standing and AUTH_PROVIDER=supabase is one
    // variable away. A profile deleted here and left behind there comes back as an account that
    // signs in with no app_users row to catch it.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";

    const result = await actions.deleteUser({ userId: TARGET_ID });

    expect(result).toEqual({});
    expect(supabaseDeleteUser).toHaveBeenCalledWith(TARGET_ID);
    expect(appUser.deleteMany).toHaveBeenCalledWith({ where: { id: TARGET_ID } });
  });

  it("does not let GoTrue refuse a deletion it no longer decides", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    supabaseDeleteUser.mockRejectedValueOnce(new Error("network"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await actions.deleteUser({ userId: TARGET_ID });

    expect(result).toEqual({});
    expect(appUser.deleteMany).toHaveBeenCalledWith({ where: { id: TARGET_ID } });
    // The failure is reported, and the line carries the id rather than the address.
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0][0]).not.toContain(TARGET_EMAIL);
    logged.mockRestore();
  });
});

// AUTH_PROVIDER=supabase is the rollback, so it has to keep working exactly as it did.
describe("the Supabase branch is unchanged", () => {
  beforeEach(() => {
    process.env.AUTH_PROVIDER = "supabase";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  });

  it("rotates the password through GoTrue and mirrors the hash locally for the cutover", async () => {
    appUser.findUnique.mockResolvedValueOnce({ id: TARGET_ID, email: TARGET_EMAIL });

    const result = await actions.resetUserPassword({
      userId: TARGET_ID,
      tempPassword: "otra-clave-12",
    });

    expect(result).toEqual({});
    expect(supabaseUpdateUserById).toHaveBeenCalledWith(TARGET_ID, {
      password: "otra-clave-12",
      email_confirm: true,
    });
    expect(compareSync("otra-clave-12", writtenHash(appUser.updateMany.mock.calls[0][0]))).toBe(
      true,
    );
    // GoTrue is asked FIRST and its verdict is what the caller waits on: a rotation this provider
    // refused must not leave a new local hash behind for the cutover to promote.
    expect(supabaseUpdateUserById.mock.invocationCallOrder[0]!).toBeLessThan(
      transaction.mock.invocationCallOrder[0]!,
    );
  });

  it("still sweeps the local sessions a rollback would hand back", async () => {
    // This used to assert the opposite (no transaction, no revocation) because GoTrue owns the
    // sessions in this mode. It owns the ones that decide anything TODAY. A session minted during
    // a `local` window sits in user_sessions through the whole Supabase window and is honoured
    // again the moment AUTH_PROVIDER goes back, so an admin who rotated a password precisely to
    // get somebody out of an account would find them still in it after a rollback and a
    // roll-forward. Deleting rows this provider does not read costs nothing.
    const result = await actions.resetUserPassword({
      userId: TARGET_ID,
      tempPassword: "otra-clave-12",
    });

    expect(result).toEqual({});
    expect(userSession.deleteMany).toHaveBeenCalledWith({ where: { userId: TARGET_ID } });
    expect(passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { userId: TARGET_ID } });
  });

  it("does not write the local hash at all when GoTrue refuses the rotation", async () => {
    supabaseUpdateUserById.mockResolvedValueOnce({
      error: { message: "weak password" },
    } as unknown as { error: null });

    const result = await actions.resetUserPassword({
      userId: TARGET_ID,
      tempPassword: "otra-clave-12",
    });

    expect(result).toEqual({ error: "authFailed" });
    expect(transaction).not.toHaveBeenCalled();
    expect(appUser.updateMany).not.toHaveBeenCalled();
    expect(userSession.deleteMany).not.toHaveBeenCalled();
  });

  it("creates the auth user first and refuses an address that already has a profile", async () => {
    appUser.findUnique.mockResolvedValueOnce({ id: TARGET_ID });

    const result = await actions.createUser({
      email: TARGET_EMAIL,
      tempPassword: "temporal-1234",
      role: "COMPANY_USER",
      companyId: COMPANY_ID,
    });

    expect(result).toEqual({ error: "emailInUse" });
    expect(supabaseCreateUser).not.toHaveBeenCalled();
  });

  it("fails the deletion closed when GoTrue refuses, leaving the profile in place", async () => {
    supabaseDeleteUser.mockResolvedValueOnce({
      error: { status: 500, message: "boom" },
    } as unknown as { error: null });

    const result = await actions.deleteUser({ userId: TARGET_ID });

    expect(result).toEqual({ error: "authFailed" });
    expect(appUser.deleteMany).not.toHaveBeenCalled();
  });
});
