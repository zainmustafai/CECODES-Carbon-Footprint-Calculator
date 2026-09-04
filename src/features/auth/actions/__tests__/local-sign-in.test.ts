import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compareSync, getRounds, hashSync } from "bcryptjs";
import { BCRYPT_COST, PASSWORD_ALGO } from "@/lib/auth/password";
import { SESSION_COOKIE, hashToken } from "@/lib/auth/session";
import { MAX_ATTEMPTS } from "@/lib/auth/throttle-policy";

// AUTH_PROVIDER=local, which is the mode where this app decides its own sign-ins. The properties
// under test are the ones that cannot be read off the code: that an address with no account is
// answered exactly as an account with the wrong password, that a row with no hash can never
// authenticate, that a deactivated account is refused without spending an attempt, and that a
// reset link works once.
//
// Real bcrypt and the real session module throughout, against an in-memory stand-in for the Prisma
// calls they make. A stubbed compare would pass every test in this file while the deployed sign-in
// accepted the wrong password, and a stubbed session store would prove nothing about the cookie.
//
// The one thing genuinely mocked is Supabase: createClient throws here, so "GoTrue is never asked"
// is enforced rather than assumed.

type UserRow = {
  id: string;
  email: string;
  active: boolean;
  passwordHash: string | null;
  passwordAlgo: string | null;
  lastSignInAt: Date | null;
};

type SessionRow = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  lastUsedAt: Date;
  ip: string | null;
  userAgent: string | null;
};

type ResetRow = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
};

type ThrottleRow = {
  key: string;
  attempts: number;
  windowStartedAt: Date;
  lockedUntil: Date | null;
  updatedAt: Date;
};

/** The subset of a Prisma `where` these fakes understand: equality, plus one NOT of equalities. */
type Where = Record<string, unknown> & { NOT?: Record<string, unknown> };

const users = new Map<string, UserRow>();
const sessions = new Map<string, SessionRow>();
const resetTokens = new Map<string, ResetRow>();
const throttles = new Map<string, ThrottleRow>();
let nextId = 1;

function matches(row: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([field, value]) => {
    if (field === "NOT") return !matches(row, value as Where);
    return row[field] === value || (value === null && row[field] === null);
  });
}

function findOne<T extends Record<string, unknown>>(store: Map<string, T>, where: Where): T | null {
  return [...store.values()].find((row) => matches(row, where)) ?? null;
}

function updateMany<T extends Record<string, unknown>>(
  store: Map<string, T>,
  where: Where,
  data: Partial<T>,
  key: (row: T) => string,
) {
  let count = 0;
  for (const row of [...store.values()]) {
    if (!matches(row, where)) continue;
    store.set(key(row), { ...row, ...data });
    count += 1;
  }
  return { count };
}

const appUser = {
  findUnique: async ({ where }: { where: Where }) => findOne(users, where),
  updateMany: async ({ where, data }: { where: Where; data: Partial<UserRow> }) =>
    updateMany(users, where, data, (row) => row.id),
  update: async ({ where, data }: { where: Where; data: Partial<UserRow> }) => {
    const row = findOne(users, where);
    // Prisma throws P2025 when update matches nothing, and the reset transaction depends on that.
    if (!row) throw new Error("P2025: record to update not found");
    const next = { ...row, ...data };
    users.set(row.id, next);
    return next;
  },
};

const userSession = {
  create: async ({ data }: { data: Omit<SessionRow, "id" | "createdAt" | "lastUsedAt"> }) => {
    const now = new Date();
    const row: SessionRow = { id: `session-${nextId++}`, createdAt: now, lastUsedAt: now, ...data };
    sessions.set(row.id, row);
    return row;
  },
  findUnique: async ({ where }: { where: Where }) => findOne(sessions, where),
  deleteMany: async ({ where }: { where: Where }) => {
    let count = 0;
    for (const row of [...sessions.values()]) {
      if (matches(row, where)) count += sessions.delete(row.id) ? 1 : 0;
    }
    return { count };
  },
};

const passwordResetToken = {
  create: async ({ data }: { data: Omit<ResetRow, "id" | "createdAt" | "consumedAt"> }) => {
    const row: ResetRow = {
      id: `reset-${nextId++}`,
      createdAt: new Date(),
      consumedAt: null,
      ...data,
    };
    resetTokens.set(row.id, row);
    return row;
  },
  findUnique: async ({ where }: { where: Where }) => {
    const row = findOne(resetTokens, where);
    // The relation is required in the schema, so a row always resolves to a user. The action
    // selects the address through it, to rebuild the throttle keys once the reset has landed.
    return row ? { ...row, user: users.get(row.userId)! } : null;
  },
  updateMany: async ({ where, data }: { where: Where; data: Partial<ResetRow> }) =>
    updateMany(resetTokens, where, data, (row) => row.id),
};

const authThrottle = {
  findMany: async ({ where }: { where: { key: { in: string[] } } }) =>
    where.key.in.flatMap((key) => (throttles.has(key) ? [throttles.get(key)!] : [])),
  upsert: async ({
    where,
    create,
    update,
  }: {
    where: { key: string };
    create: Omit<ThrottleRow, "updatedAt">;
    update: Omit<ThrottleRow, "key" | "updatedAt">;
  }) => {
    const existing = throttles.get(where.key);
    const next = existing
      ? { ...existing, ...update, updatedAt: new Date() }
      : { ...create, updatedAt: new Date() };
    throttles.set(where.key, next);
    return next;
  },
  deleteMany: async ({ where }: { where: { key: { in: string[] } } }) => {
    let count = 0;
    for (const key of where.key.in) if (throttles.delete(key)) count += 1;
    return { count };
  },
};

type PrismaFake = {
  appUser: typeof appUser;
  userSession: typeof userSession;
  passwordResetToken: typeof passwordResetToken;
  authThrottle: typeof authThrottle;
  // The interactive form: the reset action runs statements and reads a count between them, so a
  // fake that only accepted an array of promises would not exercise the transaction at all.
  $transaction: <T>(run: (tx: PrismaFake) => Promise<T>) => Promise<T>;
};

const prismaFake: PrismaFake = {
  appUser,
  userSession,
  passwordResetToken,
  authThrottle,
  $transaction: async (run) => run(prismaFake),
};

vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return prismaFake;
  },
}));

/** The cookie jar the action writes into, with only what next/headers actually exposes here. */
const cookieJar = new Map<string, string>();
const jar = {
  get: (name: string) => {
    const value = cookieJar.get(name);
    return value === undefined ? undefined : { name, value };
  },
  set: (name: string, value: string) => {
    cookieJar.set(name, value);
  },
  delete: (name: string) => {
    cookieJar.delete(name);
  },
};

vi.mock("next/headers", () => ({
  headers: async () =>
    new Map([
      ["x-forwarded-for", "203.0.113.7"],
      ["user-agent", "vitest"],
    ]),
  cookies: async () => jar,
}));

/**
 * after() callbacks, run on demand.
 *
 * The reset request deliberately does its lookup and its send after the response, so a test that
 * did not drain this queue would assert on a request that had not happened yet.
 */
const afterTasks: Promise<unknown>[] = [];
async function flushAfter() {
  await Promise.all(afterTasks.splice(0));
}
vi.mock("next/server", () => ({
  after: (task: () => unknown) => {
    afterTasks.push(Promise.resolve().then(task));
  },
}));

const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

const sendMail = vi.fn();
vi.mock("@/lib/mail/send", () => ({ sendMail: (input: unknown) => sendMail(input) }));

const getUser = vi.fn();
vi.mock("@/lib/auth/server", () => ({ getUser: () => getUser() }));

/**
 * Wraps the real implementation, so "was it called at all, and with what hash" can be asserted.
 *
 * vi.hoisted because this module is imported statically above for its constants, which runs the
 * factory before an ordinary const would exist.
 */
const verifyPassword = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/password", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/password")>();
  verifyPassword.mockImplementation(actual.verifyPassword);
  return { ...actual, verifyPassword };
});

/**
 * Self-serve registration, forced open.
 *
 * The flag is false in the repository and signUpAction refuses on it first, which would make the
 * provider gate below it untestable and, worse, unreachable in exactly the situation it exists for:
 * the flag's own comment invites a maintainer to "flip to true to reopen it". Opening it here is
 * how the second gate gets exercised. signUpAction is the only reader of this flag in the module
 * under test, so nothing else in this file changes meaning.
 */
vi.mock("@/lib/feature-flags", () => ({ FEATURE_SELF_ONBOARDING: true }));

const {
  requestPasswordResetAction,
  resetPasswordWithTokenAction,
  signInAction,
  signOutAction,
  signUpAction,
  updatePasswordAction,
} = await import("../auth-actions");

const EMAIL = "persona@empresa.com";
const PASSWORD = "una contrasena valida";
const WRONG = "otra contrasena distinta";

/** Hashed once, at the real cost, because every sign-in test below verifies against it. */
const CURRENT_HASH = hashSync(PASSWORD, BCRYPT_COST);
/** What the migration left behind: a hash made below the cost this app writes today. */
const LEGACY_HASH = hashSync(PASSWORD, 6);

function seedUser(overrides: Partial<UserRow> = {}): UserRow {
  const row: UserRow = {
    id: "user-1",
    email: EMAIL,
    active: true,
    passwordHash: CURRENT_HASH,
    passwordAlgo: PASSWORD_ALGO,
    lastSignInAt: null,
    ...overrides,
  };
  users.set(row.id, row);
  return row;
}

function sessionsOf(userId: string) {
  return [...sessions.values()].filter((row) => row.userId === userId);
}

beforeEach(() => {
  users.clear();
  sessions.clear();
  resetTokens.clear();
  throttles.clear();
  cookieJar.clear();
  afterTasks.length = 0;
  nextId = 1;
  createClient.mockReset();
  sendMail.mockReset();
  sendMail.mockResolvedValue({ ok: true });
  getUser.mockReset();
  // mockClear, not mockReset: the implementation set in the module factory is the real function,
  // and resetting would replace it with one that returns undefined for every password.
  verifyPassword.mockClear();
  vi.stubEnv("AUTH_PROVIDER", "local");
});

// Vitest can run several files in one worker process, so a stub left standing here would decide
// the provider for whichever file runs next.
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("signInAction in local mode", () => {
  it("issues a session cookie for the right password, without asking Supabase", async () => {
    const user = seedUser();

    expect(await signInAction({ email: EMAIL, password: PASSWORD })).toEqual({});
    expect(createClient).not.toHaveBeenCalled();

    const cookie = cookieJar.get(SESSION_COOKIE);
    expect(cookie).toBeTruthy();
    // The cookie carries the plaintext and the row carries only its digest.
    const stored = sessionsOf(user.id);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.tokenHash).toBe(hashToken(cookie!));
    expect([...sessions.values()].some((row) => row.tokenHash === cookie)).toBe(false);
    expect(users.get(user.id)!.lastSignInAt).toBeInstanceOf(Date);
  });

  it("accepts the address however it was capitalised", async () => {
    seedUser();

    expect(await signInAction({ email: ` ${EMAIL.toUpperCase()} `, password: PASSWORD })).toEqual(
      {},
    );
  });

  it("refuses the wrong password, issues nothing, and counts the attempt", async () => {
    seedUser();

    expect(await signInAction({ email: EMAIL, password: WRONG })).toEqual({
      error: "invalidCredentials",
    });
    expect(cookieJar.size).toBe(0);
    expect(sessions.size).toBe(0);
    expect(throttles.size).toBeGreaterThan(0);
  });

  it("answers an unknown address exactly as it answers a wrong password", async () => {
    seedUser();
    const wrongPassword = await signInAction({ email: EMAIL, password: WRONG });
    throttles.clear();
    verifyPassword.mockClear();

    const unknownAddress = await signInAction({ email: "nadie@empresa.com", password: PASSWORD });

    expect(unknownAddress).toEqual(wrongPassword);
    // The dummy comparison has to run, or the fast answer is itself the reply: an address with no
    // account would be refused in under a millisecond where a real one spends a quarter second.
    expect(verifyPassword).toHaveBeenCalledTimes(1);
    expect(verifyPassword.mock.calls[0]?.[1]).toBeFalsy();
    expect(sessions.size).toBe(0);
    expect(throttles.size).toBeGreaterThan(0);
  });

  it("refuses a row that has no hash, whatever password is offered", async () => {
    const user = seedUser({ passwordHash: null, passwordAlgo: null });

    expect(await signInAction({ email: EMAIL, password: PASSWORD })).toEqual({
      error: "invalidCredentials",
    });
    expect(sessionsOf(user.id)).toHaveLength(0);
    expect(cookieJar.size).toBe(0);
  });

  it("refuses a deactivated account and does not count the attempt against it", async () => {
    const user = seedUser({ active: false });

    expect(await signInAction({ email: EMAIL, password: PASSWORD })).toEqual({
      error: "accountDisabled",
    });
    expect(sessionsOf(user.id)).toHaveLength(0);
    expect(cookieJar.size).toBe(0);
    // The password was right, so counting it would let a deactivated user lock out the address
    // they may later be reactivated on.
    expect(throttles.size).toBe(0);
  });

  it("upgrades a legacy hash on the sign-in that proves the password", async () => {
    const user = seedUser({ passwordHash: LEGACY_HASH });
    expect(getRounds(LEGACY_HASH)).toBeLessThan(BCRYPT_COST);

    expect(await signInAction({ email: EMAIL, password: PASSWORD })).toEqual({});

    const stored = users.get(user.id)!;
    expect(stored.passwordHash).not.toBe(LEGACY_HASH);
    expect(getRounds(stored.passwordHash!)).toBe(BCRYPT_COST);
    expect(stored.passwordAlgo).toBe(PASSWORD_ALGO);
    // The same password still opens the account: the upgrade is invisible to the user.
    expect(compareSync(PASSWORD, stored.passwordHash!)).toBe(true);
  });

  it("leaves a hash alone when it is already at the cost this app writes", async () => {
    const user = seedUser();

    await signInAction({ email: EMAIL, password: PASSWORD });

    expect(users.get(user.id)!.passwordHash).toBe(CURRENT_HASH);
  });

  it("stops spending bcrypt once the allowance is gone", async () => {
    seedUser();
    for (let i = 0; i < MAX_ATTEMPTS; i++) await signInAction({ email: EMAIL, password: WRONG });
    verifyPassword.mockClear();

    expect(await signInAction({ email: EMAIL, password: PASSWORD })).toEqual({
      error: "tooManyAttempts",
    });
    // The throttle sits in front of the hash, not behind it: an unmetered endpoint that spends a
    // quarter second of CPU per request is a denial of service lever as well as a guessing one.
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it("forgets the failures once the right password arrives", async () => {
    seedUser();
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      await signInAction({ email: EMAIL, password: WRONG });
    }

    expect(await signInAction({ email: EMAIL, password: PASSWORD })).toEqual({});
    expect(throttles.size).toBe(0);
  });
});

describe("signOutAction in local mode", () => {
  it("destroys the session behind the cookie and clears the cookie", async () => {
    seedUser();
    await signInAction({ email: EMAIL, password: PASSWORD });
    expect(sessions.size).toBe(1);

    await signOutAction();

    expect(sessions.size).toBe(0);
    expect(cookieJar.size).toBe(0);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("does not throw when there is no cookie to sign out", async () => {
    await expect(signOutAction()).resolves.toBeUndefined();
  });
});

describe("requestPasswordResetAction in local mode", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("MAIL_FROM", "CECODES <no-reply@example.org>");
    // Without a configured origin the link would be a bare path, which is also what a deployment
    // that forgot this variable would mail out.
    vi.stubEnv("SITE_URL", "https://huella.example.org");
  });

  it("writes one token and mails a link that carries it", async () => {
    const user = seedUser();

    await requestPasswordResetAction(EMAIL);
    await flushAfter();

    const rows = [...resetTokens.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(user.id);
    expect(rows[0]!.consumedAt).toBeNull();

    expect(sendMail).toHaveBeenCalledTimes(1);
    const message = sendMail.mock.calls[0]![0] as { to: string; text: string };
    expect(message.to).toBe(EMAIL);
    const token = new URL(message.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
    // Only the digest was stored, so the emailed value is the only copy of the token.
    expect(rows[0]!.tokenHash).toBe(hashToken(token));
    expect(rows[0]!.tokenHash).not.toBe(token);
  });

  it("writes nothing and sends nothing for an address with no account", async () => {
    await requestPasswordResetAction("nadie@empresa.com");
    await flushAfter();

    expect(resetTokens.size).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("writes nothing for a deactivated account", async () => {
    seedUser({ active: false });

    await requestPasswordResetAction(EMAIL);
    await flushAfter();

    expect(resetTokens.size).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("returns the same nothing whatever the address, and meters the endpoint", async () => {
    seedUser();

    await expect(requestPasswordResetAction(EMAIL)).resolves.toBeUndefined();
    await expect(requestPasswordResetAction("nadie@empresa.com")).resolves.toBeUndefined();
    expect(throttles.size).toBeGreaterThan(0);
  });

  it("writes no token when the deployment cannot send mail", async () => {
    seedUser();
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("MAIL_FROM", "");

    await requestPasswordResetAction(EMAIL);
    await flushAfter();

    // A row that can never be delivered is a live credential sitting in the table for an hour.
    expect(resetTokens.size).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("counts nothing against an address it cannot mail, so asking does not lock the account", async () => {
    seedUser();
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("MAIL_FROM", "");

    // The button on /reset-password says "Solicitar un enlace nuevo", and someone who never
    // receives one presses it. On a deployment with no mail there is nothing to meter, so a count
    // here would be a lockout with nothing on the other side of it: no link is ever issued, so
    // nothing can clear it before the window closes.
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) await requestPasswordResetAction(EMAIL);
    await flushAfter();

    expect(throttles.size).toBe(0);
    expect(await signInAction({ email: EMAIL, password: PASSWORD })).toEqual({});
  });

  it("sends nothing when no public origin is configured, rather than mailing a bare path", async () => {
    seedUser();
    // What a self-hosted deployment looks like before anyone sets DOMAIN: .env.example ships it
    // commented out, and the compose default of "localhost" is deliberately ignored.
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("DOMAIN", "");
    vi.stubEnv("VERCEL_URL", "");

    await requestPasswordResetAction(EMAIL);
    await flushAfter();

    // "/reset-password?token=..." in a mail client resolves against nothing, so the link is dead on
    // arrival while the token behind it stays live for the hour. Same trade as the mail guard.
    expect(resetTokens.size).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
    expect(throttles.size).toBe(0);
  });
});

describe("signUpAction in local mode", () => {
  it("refuses, because GoTrue is not the store that decides a local sign-in", async () => {
    // The account it would create has no app_users row and no passwordHash, and verifyPassword
    // refuses a null hash. The person would confirm their address and then be unable to sign in
    // with the password they had just chosen, forever.
    expect(await signUpAction({ email: "nuevo@empresa.com", password: PASSWORD })).toEqual({
      error: "registrationDisabled",
    });
    expect(createClient).not.toHaveBeenCalled();
    expect(users.size).toBe(0);
  });

  it("still reaches Supabase while GoTrue holds the passwords", async () => {
    vi.stubEnv("AUTH_PROVIDER", "supabase");
    createClient.mockReturnValue({
      auth: { signUp: async () => ({ data: { session: null }, error: null }) },
    });

    expect(await signUpAction({ email: "nuevo@empresa.com", password: PASSWORD })).toEqual({
      needsConfirmation: true,
    });
    expect(createClient).toHaveBeenCalled();
  });
});

describe("resetPasswordWithTokenAction", () => {
  const NEW_PASSWORD = "una contrasena nueva";

  /** Mints a token the way the request action does, so the tests exercise the real digest. */
  function seedToken(overrides: Partial<ResetRow> = {}) {
    const token = `token-${nextId++}`;
    const row: ResetRow = {
      id: `reset-${nextId++}`,
      userId: "user-1",
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      consumedAt: null,
      createdAt: new Date(),
      ...overrides,
    };
    resetTokens.set(row.id, row);
    return { token, row };
  }

  it("sets the new password, consumes the link, and signs the user out everywhere", async () => {
    const user = seedUser();
    await signInAction({ email: EMAIL, password: PASSWORD });
    expect(sessionsOf(user.id)).toHaveLength(1);
    const { token, row } = seedToken();

    expect(await resetPasswordWithTokenAction({ token, password: NEW_PASSWORD })).toEqual({});

    const stored = users.get(user.id)!;
    expect(compareSync(NEW_PASSWORD, stored.passwordHash!)).toBe(true);
    expect(compareSync(PASSWORD, stored.passwordHash!)).toBe(false);
    expect(resetTokens.get(row.id)!.consumedAt).toBeInstanceOf(Date);
    // Every session goes, including the one the reset was requested from: the point of a reset is
    // that a session opened with the old password does not outlive it.
    expect(sessionsOf(user.id)).toHaveLength(0);
  });

  it("does not sign the user in, so a forwarded email cannot become a session", async () => {
    seedUser();
    const { token } = seedToken();

    await resetPasswordWithTokenAction({ token, password: NEW_PASSWORD });

    expect(sessions.size).toBe(0);
    expect(cookieJar.size).toBe(0);
  });

  it("refuses the second use of a link", async () => {
    seedUser();
    const { token } = seedToken();

    expect(await resetPasswordWithTokenAction({ token, password: NEW_PASSWORD })).toEqual({});
    expect(await resetPasswordWithTokenAction({ token, password: "otra contrasena mas" })).toEqual({
      error: "invalidResetLink",
    });

    const stored = users.get("user-1")!;
    expect(compareSync(NEW_PASSWORD, stored.passwordHash!)).toBe(true);
  });

  it("retires the other links the account had outstanding", async () => {
    seedUser();
    // Asking twice is ordinary: nothing arrives in the first few seconds and the user presses the
    // button again. The unused link must not survive to set a third password afterwards.
    const first = seedToken();
    const second = seedToken();

    expect(
      await resetPasswordWithTokenAction({ token: second.token, password: NEW_PASSWORD }),
    ).toEqual({});

    expect(resetTokens.get(first.row.id)!.consumedAt).toBeInstanceOf(Date);
    expect(
      await resetPasswordWithTokenAction({ token: first.token, password: "otra contrasena mas" }),
    ).toEqual({ error: "invalidResetLink" });
  });

  it("leaves the user able to sign in, rather than locked out by their own requests", async () => {
    seedUser();
    // Every request for a link counts against the sign-in bucket, so by the time a link works the
    // address is often already locked. A reset that ends at a "demasiados intentos" screen is not
    // a reset.
    for (let i = 0; i < MAX_ATTEMPTS; i++) await signInAction({ email: EMAIL, password: WRONG });
    const { token } = seedToken();

    expect(await resetPasswordWithTokenAction({ token, password: NEW_PASSWORD })).toEqual({});

    expect(throttles.size).toBe(0);
    expect(await signInAction({ email: EMAIL, password: NEW_PASSWORD })).toEqual({});
  });

  it("refuses a link that was already consumed", async () => {
    seedUser();
    const { token } = seedToken({ consumedAt: new Date() });

    expect(await resetPasswordWithTokenAction({ token, password: NEW_PASSWORD })).toEqual({
      error: "invalidResetLink",
    });
    expect(users.get("user-1")!.passwordHash).toBe(CURRENT_HASH);
  });

  it("refuses an expired link", async () => {
    seedUser();
    const { token } = seedToken({ expiresAt: new Date(Date.now() - 1000) });

    expect(await resetPasswordWithTokenAction({ token, password: NEW_PASSWORD })).toEqual({
      error: "invalidResetLink",
    });
    expect(users.get("user-1")!.passwordHash).toBe(CURRENT_HASH);
  });

  it("refuses a link whose account was deactivated after it was sent", async () => {
    const user = seedUser();
    await signInAction({ email: EMAIL, password: PASSWORD });
    // Minted while the account was still good, which is the only way this state is reached: the
    // request action refuses to mint one for a deactivated account.
    const { token, row } = seedToken();
    users.set(user.id, { ...users.get(user.id)!, active: false });

    expect(await resetPasswordWithTokenAction({ token, password: NEW_PASSWORD })).toEqual({
      error: "invalidResetLink",
    });

    // Nothing moved. An admin who deactivates a compromised account must not find that whoever
    // reads its mail can still rewrite the password, end the owner's sessions, and clear the
    // address's sign-in lockout on the way out.
    expect(users.get(user.id)!.passwordHash).toBe(CURRENT_HASH);
    expect(resetTokens.get(row.id)!.consumedAt).toBeNull();
    expect(sessionsOf(user.id)).toHaveLength(1);
  });

  it("refuses a token nobody ever issued, in the same words", async () => {
    seedUser();

    expect(
      await resetPasswordWithTokenAction({ token: "inventado", password: NEW_PASSWORD }),
    ).toEqual({ error: "invalidResetLink" });
  });

  it("refuses a password below the documented minimum before touching the token", async () => {
    seedUser();
    const { token, row } = seedToken();

    expect(await resetPasswordWithTokenAction({ token, password: "1234567" })).toEqual({
      error: "invalidInput",
    });
    // The link survives a typo: refusing it would cost the user a second email.
    expect(resetTokens.get(row.id)!.consumedAt).toBeNull();
  });

  it("refuses unknown fields, so nothing can ride along to the password write", async () => {
    seedUser();
    const { token } = seedToken();

    const input = { token, password: NEW_PASSWORD, userId: "someone-else" };
    expect(await resetPasswordWithTokenAction(input as never)).toEqual({ error: "invalidInput" });
    expect(users.get("user-1")!.passwordHash).toBe(CURRENT_HASH);
  });

  it("decides nothing outside local mode, where GoTrue still holds the password", async () => {
    seedUser();
    const { token } = seedToken();
    vi.stubEnv("AUTH_PROVIDER", "shadow");

    expect(await resetPasswordWithTokenAction({ token, password: NEW_PASSWORD })).toEqual({
      error: "invalidResetLink",
    });
    expect(users.get("user-1")!.passwordHash).toBe(CURRENT_HASH);
  });
});

describe("updatePasswordAction, the signed-in change", () => {
  const NEW_PASSWORD = "una contrasena nueva";

  /** The password change is the one auth flow that runs with a session already in hand. */
  async function signedIn() {
    const user = seedUser();
    await signInAction({ email: EMAIL, password: PASSWORD });
    getUser.mockResolvedValue({ id: user.id, email: user.email });
    return user;
  }

  it("stores the new password and keeps the tab it was typed in signed in", async () => {
    const user = await signedIn();
    const kept = cookieJar.get(SESSION_COOKIE)!;

    expect(
      await updatePasswordAction({ password: NEW_PASSWORD, currentPassword: PASSWORD }),
    ).toEqual({});

    expect(compareSync(NEW_PASSWORD, users.get(user.id)!.passwordHash!)).toBe(true);
    // Signing someone out of the tab they just typed the new password into reads as a failure,
    // and it is the one session that is certainly theirs.
    expect(sessionsOf(user.id).map((row) => row.tokenHash)).toEqual([hashToken(kept)]);
  });

  it("retires a reset link that was still outstanding", async () => {
    const user = await signedIn();
    // The ordinary story: they asked for a link, remembered the password before it arrived, signed
    // in and changed it here. That mail must not still be able to overrule the password they chose.
    const row: ResetRow = {
      id: "reset-outstanding",
      userId: user.id,
      tokenHash: hashToken("emailed-token"),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      consumedAt: null,
      createdAt: new Date(),
    };
    resetTokens.set(row.id, row);

    expect(
      await updatePasswordAction({ password: NEW_PASSWORD, currentPassword: PASSWORD }),
    ).toEqual({});

    expect(resetTokens.get(row.id)!.consumedAt).toBeInstanceOf(Date);
    expect(
      await resetPasswordWithTokenAction({ token: "emailed-token", password: "otra contrasena" }),
    ).toEqual({ error: "invalidResetLink" });
    expect(compareSync(NEW_PASSWORD, users.get(user.id)!.passwordHash!)).toBe(true);
  });

  it("refuses an anonymous caller, because a page guard protects rendering only", async () => {
    seedUser();
    getUser.mockResolvedValue(null);

    expect(
      await updatePasswordAction({ password: NEW_PASSWORD, currentPassword: PASSWORD }),
    ).toEqual({ error: "sessionExpired" });
    expect(users.get("user-1")!.passwordHash).toBe(CURRENT_HASH);
  });
});

describe("updatePasswordAction while GoTrue still decides", () => {
  const NEW_PASSWORD = "una contrasena nueva";
  const updateUser = vi.fn();

  beforeEach(() => {
    updateUser.mockReset();
    updateUser.mockResolvedValue({ error: null });
    createClient.mockResolvedValue({ auth: { updateUser } });
    getUser.mockResolvedValue({ id: "user-1", email: EMAIL });
  });

  // Both non-local modes, because supabase mode is defined as "the local hash column is written
  // but never read": the writing half is what makes shadow mode meaningful and what makes the
  // cutover survivable, and it was the half this path skipped.
  it.each(["supabase", "shadow"])(
    "in %s mode, mirrors the password GoTrue just accepted into the local hash",
    async (provider) => {
      const user = seedUser();
      vi.stubEnv("AUTH_PROVIDER", provider);

      expect(await updatePasswordAction({ password: NEW_PASSWORD })).toEqual({});

      expect(updateUser).toHaveBeenCalledWith({ password: NEW_PASSWORD });
      const stored = users.get(user.id)!;
      // Left behind, the backfilled hash makes the shadow log cry wolf on every later sign-in by
      // this user, and it becomes the live credential the day AUTH_PROVIDER flips to local: the
      // retired password would open the account and the current one would not.
      expect(compareSync(NEW_PASSWORD, stored.passwordHash!)).toBe(true);
      expect(compareSync(PASSWORD, stored.passwordHash!)).toBe(false);
      expect(stored.passwordAlgo).toBe(PASSWORD_ALGO);
    },
  );

  it("writes no local hash when GoTrue refused the change", async () => {
    const user = seedUser();
    vi.stubEnv("AUTH_PROVIDER", "shadow");
    updateUser.mockResolvedValue({ error: new Error("weak password") });

    expect(await updatePasswordAction({ password: NEW_PASSWORD })).toEqual({ error: "generic" });

    expect(users.get(user.id)!.passwordHash).toBe(CURRENT_HASH);
  });

  it("retires the local sessions a rollback would otherwise reinstate", async () => {
    const user = await (async () => {
      const row = seedUser();
      vi.stubEnv("AUTH_PROVIDER", "local");
      await signInAction({ email: EMAIL, password: PASSWORD });
      vi.stubEnv("AUTH_PROVIDER", "shadow");
      return row;
    })();
    // A link the user had asked for before they remembered the password, still live for the hour.
    resetTokens.set("reset-outstanding", {
      id: "reset-outstanding",
      userId: user.id,
      tokenHash: hashToken("emailed-token"),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      consumedAt: null,
      createdAt: new Date(),
    });

    expect(await updatePasswordAction({ password: NEW_PASSWORD })).toEqual({});

    // This used to assert the opposite, on the reading that GoTrue holds the only session that
    // decides anything here. True while the flag stays put, and the flag is one variable: the row
    // sits through the whole Supabase window and is honoured again the moment AUTH_PROVIDER goes
    // back to local, up to thirty days later, on a password the user retired in the interim.
    expect(sessionsOf(user.id)).toHaveLength(0);
    expect(resetTokens.get("reset-outstanding")!.consumedAt).toBeInstanceOf(Date);
  });
});

describe("the session a sign-in issues", () => {
  it("never adopts a token the caller planted in the cookie jar", async () => {
    const user = seedUser();
    // Session fixation, in one line: an attacker sets cecodes_session to a value they know (a
    // sibling subdomain, a shared machine), the victim signs in, and if the sign-in reused what was
    // already there, the attacker's copy would now authenticate as the victim. Nothing in the suite
    // put a value in the jar before a sign-in, so a code path that adopted one would have passed.
    const planted = "un-token-que-el-atacante-ya-conoce";
    cookieJar.set(SESSION_COOKIE, planted);

    expect(await signInAction({ email: EMAIL, password: PASSWORD })).toEqual({});

    const issued = cookieJar.get(SESSION_COOKIE)!;
    expect(issued).not.toBe(planted);
    // And the planted value resolves to nothing: no row was ever written for its digest.
    expect([...sessions.values()].some((row) => row.tokenHash === hashToken(planted))).toBe(false);
    expect(sessionsOf(user.id).map((row) => row.tokenHash)).toEqual([hashToken(issued)]);
  });

  it("issues a fresh token on every sign-in, so two devices are two sessions", async () => {
    const user = seedUser();

    await signInAction({ email: EMAIL, password: PASSWORD });
    const first = cookieJar.get(SESSION_COOKIE)!;
    await signInAction({ email: EMAIL, password: PASSWORD });
    const second = cookieJar.get(SESSION_COOKIE)!;

    expect(second).not.toBe(first);
    expect(sessionsOf(user.id)).toHaveLength(2);
  });

  it("does not issue one to an account deactivated while the password was being checked", async () => {
    // The race the `active: true` in the update's WHERE closes. setUserActive sweeps user_sessions
    // in the same transaction as the flag, so a row inserted a moment AFTER that sweep survives it
    // and never gets swept again. Authorization still refuses the person everywhere; what is left
    // behind is a live-looking session for an account that is switched off, which is exactly the
    // state an admin reading the table during an incident cannot interpret.
    const user = seedUser();
    const realVerify = verifyPassword.getMockImplementation()!;
    verifyPassword.mockImplementationOnce(async (...args: unknown[]) => {
      users.set(user.id, { ...users.get(user.id)!, active: false });
      return realVerify(...args);
    });

    expect(await signInAction({ email: EMAIL, password: PASSWORD })).toEqual({
      error: "invalidCredentials",
    });

    expect(sessionsOf(user.id)).toHaveLength(0);
    expect(cookieJar.size).toBe(0);
  });
});

describe("signInAction when the store itself fails", () => {
  it("answers with an opaque key instead of throwing out of the action", async () => {
    // use-login.ts only ever reads the returned error key, so an unhandled rejection is a form that
    // stops its spinner and says nothing at all. Every other auth path here already had a boundary;
    // this one, the busiest, had none.
    seedUser();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(appUser, "findUnique").mockRejectedValueOnce(new Error("connection terminated"));

    expect(await signInAction({ email: EMAIL, password: PASSWORD })).toEqual({ error: "generic" });

    expect(logged).toHaveBeenCalledTimes(1);
    // The line names where it happened and never who was trying to sign in.
    expect(logged.mock.calls[0]![0]).not.toContain(EMAIL);
    logged.mockRestore();
  });
});

describe("the password rules the server enforces on its own", () => {
  const TOO_LONG = "a".repeat(73);

  // bcrypt reads at most the first 72 bytes and ignores the rest. Without a ceiling the user is
  // told they set a 100 character password, the column holds a hash of the first 72, and typing
  // only those 72 opens the account afterwards. PASSWORD_MAX was declared and enforced in the
  // schemas, and nothing anywhere sent a password longer than it.
  it("refuses a password past the bcrypt ceiling on the signed-in change", async () => {
    const user = seedUser();
    await signInAction({ email: EMAIL, password: PASSWORD });
    getUser.mockResolvedValue({ id: user.id, email: user.email });

    expect(
      await updatePasswordAction({ password: TOO_LONG, currentPassword: PASSWORD }),
    ).toEqual({ error: "invalidInput" });
    expect(users.get(user.id)!.passwordHash).toBe(CURRENT_HASH);
  });

  it("refuses it on the emailed reset too, and leaves the link usable", async () => {
    seedUser();
    const token = `token-largo`;
    resetTokens.set("reset-largo", {
      id: "reset-largo",
      userId: "user-1",
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      consumedAt: null,
      createdAt: new Date(),
    });

    expect(await resetPasswordWithTokenAction({ token, password: TOO_LONG })).toEqual({
      error: "invalidInput",
    });
    expect(resetTokens.get("reset-largo")!.consumedAt).toBeNull();
  });

  it("bounds the address, so a multi-kilobyte one cannot reach the throttle key", async () => {
    // auth_throttle.key is a TEXT PRIMARY KEY, and a btree entry caps at 2704 bytes. An unbounded
    // address made recordSignInFailure raise out of an unauthenticated endpoint AFTER the full
    // quarter second of bcrypt had been spent, and the failed write meant the attempt went
    // uncounted: free CPU, forever, from a loop.
    const enormous = `${"a".repeat(3000)}@empresa.com`;

    expect(await signInAction({ email: enormous, password: PASSWORD })).toEqual({
      error: "invalidInput",
    });
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(throttles.size).toBe(0);
  });
});

describe("re-authenticating the signed-in password change", () => {
  const NEW_PASSWORD = "una contrasena nueva";

  async function signedIn() {
    const user = seedUser();
    await signInAction({ email: EMAIL, password: PASSWORD });
    getUser.mockResolvedValue({ id: user.id, email: user.email });
    return user;
  }

  it("refuses a caller who cannot produce the current password", async () => {
    // Thirty seconds at an unlocked laptop, or one injected script calling this action with the
    // ambient cookie. Without this the holder of a session sets a password of their choosing, the
    // sweep below ends every session but theirs, and the account has changed hands.
    const user = await signedIn();
    const cookie = cookieJar.get(SESSION_COOKIE)!;

    expect(
      await updatePasswordAction({ password: NEW_PASSWORD, currentPassword: "una suposicion" }),
    ).toEqual({ error: "currentPasswordIncorrect" });

    expect(users.get(user.id)!.passwordHash).toBe(CURRENT_HASH);
    // And nothing was revoked on the way out: a failed guess must not be a denial of service
    // against the real owner's other devices.
    expect(sessionsOf(user.id).map((row) => row.tokenHash)).toEqual([hashToken(cookie)]);
  });

  it("refuses an omitted one in the same words, spending the same bcrypt", async () => {
    const user = await signedIn();

    expect(await updatePasswordAction({ password: NEW_PASSWORD })).toEqual({
      error: "currentPasswordIncorrect",
    });
    expect(users.get(user.id)!.passwordHash).toBe(CURRENT_HASH);
  });

  it("ends the sessions the OLD password opened, and only that user's", async () => {
    // The half of this action that was unproven: the fixture only ever created one session, so
    // deleting the whole sweep failed nothing. Ending the sessions somebody else opened with the
    // old password is most of the reason to change one.
    const user = await signedIn();
    const kept = cookieJar.get(SESSION_COOKIE)!;
    // A second device of the same user, and a bystander who must not be touched.
    await signInAction({ email: EMAIL, password: PASSWORD });
    const other = cookieJar.get(SESSION_COOKIE)!;
    cookieJar.set(SESSION_COOKIE, kept);
    const bystander = seedUser({ id: "user-2", email: "otra@empresa.com" });
    await signInAction({ email: bystander.email, password: PASSWORD });
    cookieJar.set(SESSION_COOKIE, kept);
    expect(sessionsOf(user.id)).toHaveLength(2);

    expect(
      await updatePasswordAction({ password: NEW_PASSWORD, currentPassword: PASSWORD }),
    ).toEqual({});

    expect(sessionsOf(user.id).map((row) => row.tokenHash)).toEqual([hashToken(kept)]);
    expect([...sessions.values()].some((row) => row.tokenHash === hashToken(other))).toBe(false);
    // The blast radius is one user: the bystander is still signed in.
    expect(sessionsOf(bystander.id)).toHaveLength(1);
  });
});

describe("signOutAction outside local mode", () => {
  it("clears a local session a rollback left behind, as well as GoTrue's", async () => {
    // The rollback is one variable, and it is meant to be real. A user who signed in during a
    // `local` window holds this cookie for thirty days: flip to `supabase`, let them sign out, and
    // the old code cleared GoTrue's cookie and left ours sitting there with its row. Flip forward
    // inside the TTL and that sign-out is undone, silently.
    const user = seedUser();
    await signInAction({ email: EMAIL, password: PASSWORD });
    expect(sessionsOf(user.id)).toHaveLength(1);
    vi.stubEnv("AUTH_PROVIDER", "supabase");
    const signOut = vi.fn(async () => ({}));
    createClient.mockResolvedValue({ auth: { signOut } });

    await signOutAction();

    expect(sessionsOf(user.id)).toHaveLength(0);
    expect(cookieJar.size).toBe(0);
    // GoTrue is still told: it holds the cookie that decides who is signed in under this provider.
    expect(signOut).toHaveBeenCalled();
  });
});

describe("the reset request has its own allowance", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("MAIL_FROM", "CECODES <no-reply@example.org>");
    vi.stubEnv("SITE_URL", "https://huella.example.org");
  });

  it("stops issuing links once the allowance is spent", async () => {
    // The line this pins is the short-circuit itself. Deleting it failed no test, and what it
    // stops is an unauthenticated endpoint that SENDS MAIL being looped: the provider quota goes,
    // and whoever owns the address is buried in reset links.
    seedUser();
    for (let i = 0; i < MAX_ATTEMPTS; i++) await requestPasswordResetAction(EMAIL);
    await flushAfter();
    const issued = resetTokens.size;
    sendMail.mockClear();

    await requestPasswordResetAction(EMAIL);
    await flushAfter();

    expect(resetTokens.size).toBe(issued);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("does not lock the address out of signing in, which is what it is asking for the way back into", async () => {
    // It used to count against the sign-in keys. Someone pressing "Solicitar un enlace nuevo" is by
    // definition someone who cannot sign in, and five presses refused them at /login for fifteen
    // minutes with nothing able to lift it, because clearSignInThrottle only runs when a link is
    // consumed and no link had arrived.
    seedUser();

    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) await requestPasswordResetAction(EMAIL);
    await flushAfter();

    expect(await signInAction({ email: EMAIL, password: PASSWORD })).toEqual({});
  });

  it("cannot be used to refill the sign-in allowance either", async () => {
    // The property the shared bucket was there for, kept: nothing on the reset path clears a
    // sign-in key. Only consuming a real link does, and that takes control of the mailbox.
    seedUser();
    for (let i = 0; i < MAX_ATTEMPTS; i++) await signInAction({ email: EMAIL, password: WRONG });

    await requestPasswordResetAction(EMAIL);
    await flushAfter();

    expect(await signInAction({ email: EMAIL, password: PASSWORD })).toEqual({
      error: "tooManyAttempts",
    });
  });

  it("gives the emailed link the short life its docblock claims", async () => {
    // RESET_TTL_MINUTES is a security parameter with a long argument in its docblock and nothing
    // holding it: every other test supplies its own expiry, so the constant could have read sixty
    // DAYS and the suite would have stayed green.
    seedUser();
    const before = Date.now();

    await requestPasswordResetAction(EMAIL);
    await flushAfter();

    const [row] = [...resetTokens.values()];
    const minutes = (row!.expiresAt.getTime() - before) / 60_000;
    expect(minutes).toBeGreaterThan(55);
    expect(minutes).toBeLessThanOrEqual(60);
  });
});
