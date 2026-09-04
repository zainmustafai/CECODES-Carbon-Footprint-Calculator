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
  it("AUTH-45 writes credential and profile in the same insert, never as two separate writes", async () => {
    const result = await actions.createUser({
      email: "Nueva@Empresa.CO",
      tempPassword: "temporal-1234",
      role: "COMPANY_USER",
      companyId: COMPANY_ID,
    });

    expect(result.error).toBeUndefined();
    // One statement only: a design with a separate credential write and a separate profile
    // write could fail between the two and leave one without the other. There is only ever
    // this one call to prove that against.
    expect(appUser.create).toHaveBeenCalledTimes(1);

    const data = appUser.create.mock.calls[0][0].data;
    // Canonical casing, or the sign-in lookup (which lowercases) would never reach this row.
    expect(data.email).toBe("nueva@empresa.co");
    // Profile columns, alongside the credential columns asserted below: proof the two are one row.
    expect(data.role).toBe("COMPANY_USER");
    expect(data.companyId).toBe(COMPANY_ID);
    expect(data.active).toBe(true);
    expect(compareSync("temporal-1234", writtenHash({ data }))).toBe(true);
  });

  it("AUTH-46 reports a duplicate address as emailInUse and leaves no orphan row behind", async () => {
    appUser.create.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));

    const result = await actions.createUser({
      email: "repetida@empresa.co",
      tempPassword: "temporal-1234",
      role: "COMPANY_USER",
      companyId: COMPANY_ID,
    });

    expect(result).toEqual({ error: "emailInUse" });
    // The one statement that would have written credential and profile together is the one
    // that failed, so there is nothing partial left over to orphan.
    expect(appUser.create).toHaveBeenCalledTimes(1);
    expect(sendMail).not.toHaveBeenCalled();
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

  it("AUTH-48 sends a welcome mail carrying a set-password link, never the temporary password", async () => {
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
  it("AUTH-49 replaces the hash and ends every session, in one transaction", async () => {
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

  it("AUTH-49 sends the password-changed message with byAdmin true", async () => {
    await actions.resetUserPassword({ userId: TARGET_ID, tempPassword: "nueva-clave-1" });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const message = sendMail.mock.calls[0]![0] as { to: string; html: string };
    expect(message.to).toBe(TARGET_EMAIL);
    // passwordChangedMessage only renders this word when byAdmin is true (mail/messages.ts);
    // it distinguishes this from the self-service change, where the holder asked for it.
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
  it("AUTH-28 deactivating ends the sessions and the reset links together with the flag", async () => {
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
  it("AUTH-50 deletes the profile in one statement", async () => {
    const result = await actions.deleteUser({ userId: TARGET_ID });

    expect(result).toEqual({});
    expect(appUser.deleteMany).toHaveBeenCalledWith({ where: { id: TARGET_ID } });
    // The dependents (user_sessions, password_reset_tokens) are FK onDelete: Cascade in
    // prisma/schema.prisma rather than a second statement here, so there is nothing this
    // fake can assert about them; the schema is what proves that half of this case.
  });

  it("AUTH-50 refuses a row that is not there instead of reporting a delete that touched nobody", async () => {
    appUser.deleteMany.mockResolvedValueOnce({ count: 0 });

    const result = await actions.deleteUser({ userId: TARGET_ID });

    expect(result).toEqual({ error: "forbidden" });
  });
});

// Every server input above is re-validated against a `.strict()` Zod schema
// (src/features/admin/schemas/user-schemas.ts), independently of what the client already
// checked. An unknown key has to be refused before it reaches Prisma, not merely ignored, or a
// client (or an old build) could pass extra fields as a way to smuggle a column the UI never
// exposes.
describe("input validation", () => {
  it("AUTH-51 rejects an unexpected field on every admin action, before any write is attempted", async () => {
    const withExtra = <T extends object>(input: T) => ({ ...input, unexpected: "smuggled" });

    expect(
      await actions.createUser(
        withExtra({
          email: "nueva@empresa.co",
          tempPassword: "temporal-1234",
          role: "COMPANY_USER" as const,
          companyId: COMPANY_ID,
        }),
      ),
    ).toEqual({ error: "generic" });

    expect(
      await actions.updateUser(
        withExtra({ userId: TARGET_ID, role: "COMPANY_USER" as const, companyId: COMPANY_ID }),
      ),
    ).toEqual({ error: "generic" });

    expect(
      await actions.setUserActive(withExtra({ userId: TARGET_ID, active: true })),
    ).toEqual({ error: "generic" });

    expect(await actions.deleteUser(withExtra({ userId: TARGET_ID }))).toEqual({
      error: "generic",
    });

    expect(
      await actions.resetUserPassword(
        withExtra({ userId: TARGET_ID, tempPassword: "nueva-clave-1" }),
      ),
    ).toEqual({ error: "generic" });

    // Rejected at the schema, before resolveAdminScope or any Prisma call.
    expect(appUser.create).not.toHaveBeenCalled();
    expect(appUser.updateMany).not.toHaveBeenCalled();
    expect(appUser.deleteMany).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});
