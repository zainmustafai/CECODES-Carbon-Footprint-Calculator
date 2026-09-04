import { describe, expect, it, vi, beforeEach } from "vitest";
import { MAX_ATTEMPTS } from "@/lib/auth/throttle-policy";

// Sign-in reaches Supabase from this server, so Supabase's per-IP brute-force protection sees one
// IP for every user of the app and is effectively pooled. These tests drive the real throttle
// against an in-memory stand-in for the two Prisma calls it makes, so what is under test is the
// actual counting and the actual short-circuit in the action, not a mock of either.

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

const signInWithPassword = vi.fn();
const findUnique = vi.fn(async () => ({ active: true }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    get authThrottle() {
      return authThrottle;
    },
    appUser: {
      findUnique: (...args: unknown[]) => findUnique(...(args as [])),
    },
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: (...args: unknown[]) => signInWithPassword(...(args as [])),
      signOut: async () => ({}),
    },
  }),
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
}));

const { signInAction } = await import("../auth-actions");

const CREDENTIALS = { email: "victim@example.com", password: "wrong-password" };

function rejectCredentials() {
  signInWithPassword.mockResolvedValue({ data: {}, error: { message: "Invalid login" } });
}

beforeEach(() => {
  rows.clear();
  signInWithPassword.mockReset();
  findUnique.mockClear();
  forwardedFor.value = "203.0.113.7, 10.0.0.1";
});

describe("signInAction throttling", () => {
  it("lets the allowed number of wrong guesses through before locking", async () => {
    rejectCredentials();
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      expect(await signInAction(CREDENTIALS)).toEqual({ error: "invalidCredentials" });
    }
    expect(signInWithPassword).toHaveBeenCalledTimes(MAX_ATTEMPTS - 1);
  });

  it("refuses further attempts once the allowance is spent, without asking Supabase", async () => {
    rejectCredentials();
    for (let i = 0; i < MAX_ATTEMPTS; i++) await signInAction(CREDENTIALS);
    signInWithPassword.mockClear();

    expect(await signInAction(CREDENTIALS)).toEqual({ error: "tooManyAttempts" });
    expect(signInWithPassword).not.toHaveBeenCalled();
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

    signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    expect(await signInAction(CREDENTIALS)).toEqual({});
    expect(rows.size).toBe(0);
  });

  it("does not count a correct password on a deactivated account as a guess", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    findUnique.mockResolvedValue({ active: false });

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
