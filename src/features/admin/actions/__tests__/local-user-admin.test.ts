import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compareSync } from "bcryptjs";

// ADMIN USER MANAGEMENT.
//
// action-authorization.test.ts proves these actions refuse a caller who is not an admin. What is
// asserted here is what a reader cannot check by eye: that rotating a password revokes everything
// that could still open the account (sessions AND outstanding reset links) rather than only the
// ones that are easy to see, that a deactivation does the same, and that reactivation revokes
// nothing.
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
  // Keyed on an id, so one row matches. A write that arrived unscoped would report zero and fail
  // the count check in the action, which is the behaviour worth having in a fake.
  updateMany: vi.fn(async ({ where }: WriteArgs) => ({ count: where.id ? 1 : 0 })),
  deleteMany: vi.fn(async ({ where }: WriteArgs) => ({ count: where.id ? 1 : 0 })),
};
const company = { findUnique: vi.fn(async () => ({ id: COMPANY_ID })) };
const userSession = { deleteMany: vi.fn(async () => ({ count: 2 })) };
const passwordResetToken = {
  deleteMany: vi.fn(async () => ({ count: 1 })),
  // Only exercised by createUser's welcome mail, and only in the describe below that stubs mail
  // configuration on. Every other test in this file leaves mail unconfigured, so createUser never
  // reaches this call at all.
  create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "reset-1", ...data })),
};
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

let currentUser: typeof ADMIN | null = ADMIN;
vi.mock("@/lib/auth/server", () => ({
  getAppUser: async () => currentUser,
  getUser: async () => (currentUser ? { id: currentUser.id, email: currentUser.email } : null),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Only reached when a test below turns mail on: siteOrigin() calls headers() to read the request's
// Host as a development-only fallback, but every describe here sets SITE_URL instead, so this
// stand-in is never asked for anything the real one would need to answer for real.
vi.mock("next/headers", () => ({ headers: async () => new Map() }));

const sendMail = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/lib/mail/transport", () => ({ sendMail: (message: unknown) => sendMail(message) }));

const actions = await import("@/features/admin/actions/user-actions");

beforeEach(() => {
  vi.clearAllMocks();
  currentUser = ADMIN;
  appUser.findUnique.mockResolvedValue({ id: TARGET_ID, email: TARGET_EMAIL });
  sendMail.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** The hash written by whichever appUser statement ran, so the column is checked and not assumed. */
function writtenHash(call: { data?: Record<string, unknown> }): string {
  return String(call.data?.passwordHash ?? "");
}

describe("createUser", () => {
  it("writes one row carrying a usable hash", async () => {
    const result = await actions.createUser({
      email: "Nueva@Empresa.CO",
      tempPassword: "temporal-1234",
      role: "COMPANY_USER",
      companyId: COMPANY_ID,
    });

    expect(result.error).toBeUndefined();

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

  // The admin screen keeps showing the temporary password and offering the credentials file
  // regardless, so a deployment with no mail configured is not missing anything a user needs.
  it("sends no welcome mail on a deployment with no mail configured", async () => {
    const result = await actions.createUser({
      email: "sinmail@empresa.co",
      tempPassword: "temporal-1234",
      role: "COMPANY_USER",
      companyId: COMPANY_ID,
    });

    expect(result.error).toBeUndefined();
    expect(sendMail).not.toHaveBeenCalled();
    expect(passwordResetToken.create).not.toHaveBeenCalled();
  });

  it("sends a welcome mail carrying a set-password link, never the temporary password", async () => {
    vi.stubEnv("MAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("MAIL_FROM", "CECODES <no-reply@example.org>");
    vi.stubEnv("SITE_URL", "https://huella.example.org");

    const result = await actions.createUser({
      email: "nueva@empresa.co",
      tempPassword: "un-secreto-temporal",
      role: "COMPANY_USER",
      companyId: COMPANY_ID,
      name: "Nueva Persona",
    });

    expect(result.error).toBeUndefined();
    expect(passwordResetToken.create).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const message = sendMail.mock.calls[0]![0] as { to: string; html: string; text: string };
    expect(message.to).toBe("nueva@empresa.co");
    expect(message.html).toContain("https://huella.example.org/reset-password?token=");
    // Mailing a working password puts a live credential in an inbox forever.
    expect(message.html).not.toContain("un-secreto-temporal");
    expect(message.text).not.toContain("un-secreto-temporal");
  });

  it("does not fail the creation when the welcome mail's token cannot be written", async () => {
    vi.stubEnv("MAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("MAIL_FROM", "CECODES <no-reply@example.org>");
    vi.stubEnv("SITE_URL", "https://huella.example.org");
    passwordResetToken.create.mockRejectedValueOnce(new Error("connection terminated"));

    const result = await actions.createUser({
      email: "nueva@empresa.co",
      tempPassword: "un-secreto-temporal",
      role: "COMPANY_USER",
      companyId: COMPANY_ID,
    });

    // The account was already created: a mail-side failure must not turn that into a reported one.
    expect(result.error).toBeUndefined();
    expect(result.userId).toBeTruthy();
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("resetUserPassword", () => {
  it("stores the new hash and ends every session, in one transaction", async () => {
    const result = await actions.resetUserPassword({
      userId: TARGET_ID,
      tempPassword: "nueva-clave-1",
    });

    expect(result).toEqual({});
    expect(transaction).toHaveBeenCalledTimes(1);
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

  it("notifies the account that an admin changed its password", async () => {
    await actions.resetUserPassword({ userId: TARGET_ID, tempPassword: "nueva-clave-1" });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const message = sendMail.mock.calls[0]![0] as { to: string; html: string };
    expect(message.to).toBe(TARGET_EMAIL);
    // Distinguishes this from the self-service change: the account holder did not ask for it.
    expect(message.html).toContain("administrador");
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
});

// CECODES runs one admin: an admin who demotes, deactivates or deletes themselves locks the
// organisation out of its own admin area with no way back except SQL, because there is no
// self-serve registration and nobody left who can create an account. Only resetUserPassword's
// guard had a test; these three had none, and each is one line in the action.
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
  });

  it("still lets them act on somebody else", async () => {
    // The guard has to be an identity check and not a blanket refusal, or the screen it protects
    // would do nothing at all.
    expect(await actions.setUserActive({ userId: TARGET_ID, active: false })).toEqual({});
  });
});

describe("deleteUser", () => {
  it("deletes the profile in one statement", async () => {
    const result = await actions.deleteUser({ userId: TARGET_ID });

    expect(result).toEqual({});
    expect(appUser.deleteMany).toHaveBeenCalledWith({ where: { id: TARGET_ID } });
  });

  it("refuses a row that is not there instead of reporting a delete that touched nobody", async () => {
    appUser.deleteMany.mockResolvedValueOnce({ count: 0 });

    const result = await actions.deleteUser({ userId: TARGET_ID });

    expect(result).toEqual({ error: "forbidden" });
  });
});
