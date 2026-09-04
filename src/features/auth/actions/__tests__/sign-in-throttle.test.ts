import { describe, expect, it, vi, beforeEach } from "vitest";
import { MAX_ATTEMPTS } from "@/lib/auth/throttle-policy";

// Sign-in checks the credential against this database, so a script working through a password
// list burns real CPU on bcrypt for every attempt: an unmetered endpoint is a denial of service
// lever as well as a guessing one. These tests drive the real throttle against an in-memory
// stand-in for the two authThrottle Prisma calls it makes and the one appUser call the sign-in
// itself makes, so what is under test is the actual counting and the actual short-circuit in the
// action, not a mock of either.
//
// verifyPassword is mocked directly rather than driven through real bcrypt: this file is about the
// throttle and the IP header parsing in front of it, not about password verification, which
// local-sign-in.test.ts already proves with the real hash.

type Row = {
  key: string;
  attempts: number;
  windowStartedAt: Date;
  lockedUntil: Date | null;
  updatedAt: Date;
};

const rows = new Map<string, Row>();

const authThrottle = {
  findMany: async ({ where }: { where: { key: { in: string[] } } }) =>
    where.key.in.flatMap((key) => (rows.has(key) ? [rows.get(key)!] : [])),
  upsert: async ({
    where,
    create,
    update,
  }: {
    where: { key: string };
    create: Omit<Row, "updatedAt">;
    update: Omit<Row, "key" | "updatedAt">;
  }) => {
    const existing = rows.get(where.key);
    const next = existing
      ? { ...existing, ...update, updatedAt: new Date() }
      : { ...create, updatedAt: new Date() };
    rows.set(where.key, next);
    return next;
  },
  deleteMany: async ({ where }: { where: { key: { in: string[] } } }) => {
    let count = 0;
    for (const key of where.key.in) if (rows.delete(key)) count += 1;
    return { count };
  },
};

const verifyPassword = vi.fn();
const findUnique = vi.fn(async () => ({
  id: "u1",
  active: true,
  passwordHash: "irrelevant, verifyPassword is mocked",
  passwordAlgo: "bcrypt",
}));
const updateMany = vi.fn(async () => ({ count: 1 }));
const userSessionCreate = vi.fn(async () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    get authThrottle() {
      return authThrottle;
    },
    appUser: {
      findUnique: (...args: unknown[]) => findUnique(...(args as [])),
      updateMany: (...args: unknown[]) => updateMany(...(args as [])),
    },
    userSession: {
      create: (...args: unknown[]) => userSessionCreate(...(args as [])),
    },
  },
}));

vi.mock("@/lib/auth/password", () => ({
  verifyPassword: (...args: unknown[]) => verifyPassword(...(args as [])),
  hashPassword: async () => ({ hash: "unused", algo: "bcrypt" }),
  // Always false, so the rehash-on-sign-in branch never fires and never needs hashPassword for
  // real: nothing in this file is about the legacy-hash upgrade.
  needsRehash: () => false,
}));

/**
 * The header shape a reverse proxy actually produces, and the trap in it.
 *
 * Caddy and nginx both APPEND: a request that arrives already carrying
 * "X-Forwarded-For: 203.0.113.7" reaches the app as "203.0.113.7, <the real client>". So the
 * leading value is whatever the caller typed and the trailing one is what the proxy wrote. This
 * fixture keeps the forged value in front on purpose, so a return to reading the first hop fails
 * the test at the bottom of this file rather than passing it.
 */
const forwardedFor = { value: "203.0.113.7, 10.0.0.1" };
vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", forwardedFor.value]]),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

const { signInAction } = await import("../auth-actions");

const CREDENTIALS = { email: "victim@example.com", password: "wrong-password" };

function rejectCredentials() {
  verifyPassword.mockResolvedValue(false);
}

beforeEach(() => {
  rows.clear();
  verifyPassword.mockReset();
  findUnique.mockClear();
  findUnique.mockResolvedValue({
    id: "u1",
    active: true,
    passwordHash: "irrelevant, verifyPassword is mocked",
    passwordAlgo: "bcrypt",
  });
  forwardedFor.value = "203.0.113.7, 10.0.0.1";
});

describe("signInAction throttling", () => {
  it("lets the allowed number of wrong guesses through before locking", async () => {
    rejectCredentials();
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      expect(await signInAction(CREDENTIALS)).toEqual({ error: "invalidCredentials" });
    }
    expect(verifyPassword).toHaveBeenCalledTimes(MAX_ATTEMPTS - 1);
  });

  it("refuses further attempts once the allowance is spent, without checking the password", async () => {
    rejectCredentials();
    for (let i = 0; i < MAX_ATTEMPTS; i++) await signInAction(CREDENTIALS);
    verifyPassword.mockClear();

    expect(await signInAction(CREDENTIALS)).toEqual({ error: "tooManyAttempts" });
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it("locks the address, so switching to another password does not reset the count", async () => {
    rejectCredentials();
    for (let i = 0; i < MAX_ATTEMPTS; i++) await signInAction(CREDENTIALS);

    expect(await signInAction({ ...CREDENTIALS, password: "another-guess" })).toEqual({
      error: "tooManyAttempts",
    });
  });

  it("clears the count on a successful sign-in", async () => {
    rejectCredentials();
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) await signInAction(CREDENTIALS);

    verifyPassword.mockResolvedValue(true);
    expect(await signInAction(CREDENTIALS)).toEqual({});
    expect(rows.size).toBe(0);
  });

  it("does not count a correct password on a deactivated account as a guess", async () => {
    verifyPassword.mockResolvedValue(true);
    findUnique.mockResolvedValue({
      id: "u1",
      active: false,
      passwordHash: "irrelevant, verifyPassword is mocked",
      passwordAlgo: "bcrypt",
    });

    expect(await signInAction(CREDENTIALS)).toEqual({ error: "accountDisabled" });
    expect(rows.size).toBe(0);
  });

  it("counts against the calling IP as well as the address", async () => {
    rejectCredentials();
    await signInAction(CREDENTIALS);
    expect([...rows.keys()].sort()).toEqual(["email:victim@example.com", "ip:10.0.0.1"]);
  });

  it("takes the hop the proxy wrote, not the one the caller sent", async () => {
    // The whole per-IP allowance used to be opt-in. Reading the FIRST hop meant one header minted
    // a fresh bucket per request (so IP_MAX_ATTEMPTS never fired) and the same header could point
    // the lockout at a member company's office address instead.
    rejectCredentials();
    forwardedFor.value = "198.51.100.99, 10.0.0.1";

    await signInAction(CREDENTIALS);

    expect([...rows.keys()]).toContain("ip:10.0.0.1");
    expect([...rows.keys()]).not.toContain("ip:198.51.100.99");
  });

  it("keeps counting the address when there is no usable IP at all", async () => {
    // A deployment with the port published directly sees no header, and a crafted one can be junk.
    // Contributing no IP key is deliberate; dropping the ADDRESS key with it would not be.
    rejectCredentials();
    forwardedFor.value = "not-an-address";

    await signInAction(CREDENTIALS);

    expect([...rows.keys()]).toEqual(["email:victim@example.com"]);
  });
});
