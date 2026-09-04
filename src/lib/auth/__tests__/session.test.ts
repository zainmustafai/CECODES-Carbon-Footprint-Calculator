import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Sessions are the whole of "who is signed in" once auth is ours rather than Supabase's, and the
// two properties that matter cannot be read off the code: that the plaintext token never reaches
// the table, and that an expired row can never authenticate. So these tests drive the real
// session module against an in-memory stand-in for the four Prisma calls it makes, with real
// findUnique / create / updateMany / deleteMany semantics. What is under test is the actual
// lookup, expiry and deletion, not a mock of them.

type Row = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  lastUsedAt: Date;
  ip: string | null;
  userAgent: string | null;
};

/** The subset of `where` the module actually uses: primary key, the unique digest, or a user. */
type Where = Partial<Pick<Row, "id" | "tokenHash" | "userId">>;

const rows = new Map<string, Row>();
const users = new Map<string, { id: string; email: string }>();
let nextId = 1;
/** Counts every trip to the store, so "does not touch the store" can be asserted, not assumed. */
let queries = 0;

const matches = (row: Row, where: Where) =>
  Object.entries(where).every(([field, value]) => row[field as keyof Where] === value);

const userSession = {
  create: async ({ data }: { data: Omit<Row, "id" | "createdAt" | "lastUsedAt"> }) => {
    queries += 1;
    const now = new Date();
    const row: Row = { id: `session-${nextId++}`, createdAt: now, lastUsedAt: now, ...data };
    rows.set(row.id, row);
    return row;
  },
  findUnique: async ({ where }: { where: Where }) => {
    queries += 1;
    const row = [...rows.values()].find((candidate) => matches(candidate, where));
    // The relation is required in the schema, so a row always resolves to a user.
    return row ? { ...row, user: users.get(row.userId)! } : null;
  },
  updateMany: async ({ where, data }: { where: Where; data: Partial<Row> }) => {
    queries += 1;
    let count = 0;
    for (const row of [...rows.values()]) {
      if (!matches(row, where)) continue;
      rows.set(row.id, { ...row, ...data });
      count += 1;
    }
    return { count };
  },
  deleteMany: async ({ where }: { where: Where }) => {
    queries += 1;
    let count = 0;
    for (const row of [...rows.values()]) {
      if (matches(row, where)) count += rows.delete(row.id) ? 1 : 0;
    }
    return { count };
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    get userSession() {
      return userSession;
    },
  },
}));

const {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSession,
  destroyAllSessionsForUser,
  destroySession,
  hashToken,
  readSession,
  sessionCookieOptions,
} = await import("../session");

const ANA = { id: "user-ana", email: "ana@empresa.co" };
const BETO = { id: "user-beto", email: "beto@empresa.co" };

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const rowFor = (token: string) => [...rows.values()].find((row) => row.tokenHash === sha256(token));

beforeEach(() => {
  rows.clear();
  users.clear();
  users.set(ANA.id, ANA);
  users.set(BETO.id, BETO);
  nextId = 1;
  queries = 0;
  vi.unstubAllEnvs();
});

describe("createSession", () => {
  it("issues a token that reads back as the user it was issued to", async () => {
    const { token } = await createSession(ANA.id);
    expect(await readSession(token)).toEqual({ id: ANA.id, email: ANA.email });
  });

  // The one property a leaked database backup turns on: a stolen table must not contain
  // anything that can be pasted into a cookie.
  it("stores the digest of the token and never the token itself", async () => {
    const { token } = await createSession(ANA.id);

    const stored = rowFor(token);
    expect(stored?.tokenHash).toBe(sha256(token));
    expect(stored?.tokenHash).not.toBe(token);
    expect(JSON.stringify([...rows.values()])).not.toContain(token);
  });

  it("hands out a different token every time, so one session cannot be guessed from another", async () => {
    const first = await createSession(ANA.id);
    const second = await createSession(ANA.id);
    expect(first.token).not.toBe(second.token);
    expect(rows.size).toBe(2);
  });

  it("expires the session one TTL out and records the caller's details for support", async () => {
    const before = Date.now();
    const { token, expiresAt } = await createSession(ANA.id, {
      ip: "203.0.113.7",
      userAgent: "Mozilla/5.0",
    });

    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + SESSION_TTL_MS);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + SESSION_TTL_MS);
    expect(rowFor(token)).toMatchObject({ ip: "203.0.113.7", userAgent: "Mozilla/5.0" });
  });

  it("records nothing rather than undefined when the caller has no ip or user agent", async () => {
    const { token } = await createSession(ANA.id);
    expect(rowFor(token)).toMatchObject({ ip: null, userAgent: null });
  });

  // Both columns start life as request headers, so both are somewhere a caller who forwards one
  // unfiltered lets a stranger write. The lengths are pinned rather than imported: they are
  // bounds, and widening one should have to be done here as well as there.
  it("caps a hostile user agent instead of storing whatever arrived", async () => {
    const long = "U".repeat(5_000);

    const { token } = await createSession(ANA.id, { userAgent: long });

    const stored = rowFor(token)!.userAgent!;
    expect(stored).toHaveLength(512);
    expect(long.startsWith(stored)).toBe(true);
  });

  it("drops an address too long to be one rather than keeping a fragment of it", async () => {
    const { token } = await createSession(ANA.id, { ip: "203.0.113.7".padEnd(4_000, "0") });

    // Null, not the first 45 characters: a truncated address reads as a real one to whoever
    // opens this row during an incident.
    expect(rowFor(token)!.ip).toBeNull();
  });
});

describe("readSession", () => {
  it("returns null for a missing cookie without touching the store", async () => {
    expect(await readSession(null)).toBeNull();
    expect(await readSession(undefined)).toBeNull();
    expect(await readSession("")).toBeNull();
    expect(queries).toBe(0);
  });

  it("returns null for a token that was never issued", async () => {
    await createSession(ANA.id);
    expect(await readSession("forged-cookie-value")).toBeNull();
  });

  it("refuses an expired session and deletes the row it was presented with", async () => {
    const { token } = await createSession(ANA.id);
    const stored = rowFor(token)!;
    rows.set(stored.id, { ...stored, expiresAt: new Date(Date.now() - 1) });

    expect(await readSession(token)).toBeNull();
    expect(rows.size).toBe(0);
  });

  // ANA holds two of the three on purpose. The mistake worth catching is not deleting some other
  // user's row, which nobody writes by accident; it is widening the sweep to the whole user, which
  // is one word of a `where` clause away and signs someone out of every device the moment a
  // forgotten tab presents a stale cookie. A second user alone cannot see that.
  it("sweeps the expired row only, not the rest of that user's sessions", async () => {
    const expired = await createSession(ANA.id);
    const sameUser = await createSession(ANA.id);
    const otherUser = await createSession(BETO.id);
    const stored = rowFor(expired.token)!;
    rows.set(stored.id, { ...stored, expiresAt: new Date(Date.now() - 1) });

    await readSession(expired.token);

    expect(rows.size).toBe(2);
    expect(await readSession(sameUser.token)).toEqual({ id: ANA.id, email: ANA.email });
    expect(await readSession(otherUser.token)).toEqual({ id: BETO.id, email: BETO.email });
  });

  // The millisecond itself does not matter. That `<` instead of `<=` is a one-character edit
  // nothing else in this file would notice does.
  it("treats an expiry of exactly now as already past", async () => {
    vi.useFakeTimers();
    try {
      const { token } = await createSession(ANA.id);
      const stored = rowFor(token)!;
      rows.set(stored.id, { ...stored, expiresAt: new Date(Date.now()) });

      expect(await readSession(token)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  // A busy page fires several requests. Writing lastUsedAt on each of them would turn a read
  // into a write for no gain, since nothing authorizes on that column.
  it("does not write lastUsedAt again while it is still fresh", async () => {
    const { token } = await createSession(ANA.id);
    const first = rowFor(token)!.lastUsedAt;

    await readSession(token);
    await readSession(token);

    expect(rowFor(token)!.lastUsedAt).toBe(first);
  });

  it("writes lastUsedAt once it has gone stale, so a session's age stays roughly right", async () => {
    const { token } = await createSession(ANA.id);
    const stored = rowFor(token)!;
    const stale = new Date(Date.now() - 3 * 60 * 60 * 1000);
    rows.set(stored.id, { ...stored, lastUsedAt: stale });

    await readSession(token);

    expect(rowFor(token)!.lastUsedAt.getTime()).toBeGreaterThan(stale.getTime());
  });

  // Whether a user may act is company-scope.ts's decision and has to stay there. This function
  // answers one question: does this cookie name a live session.
  it("resolves the session from the joined user row", async () => {
    const { token } = await createSession(BETO.id);
    expect(await readSession(token)).toEqual({ id: BETO.id, email: BETO.email });
  });
});

describe("destroySession", () => {
  it("removes exactly the session whose token was presented", async () => {
    const signedOut = await createSession(ANA.id);
    const other = await createSession(ANA.id);

    await destroySession(signedOut.token);

    expect(rows.size).toBe(1);
    expect(await readSession(signedOut.token)).toBeNull();
    expect(await readSession(other.token)).toEqual({ id: ANA.id, email: ANA.email });
  });

  it("accepts a missing or unknown token without touching the store or throwing", async () => {
    await destroySession(null);
    await destroySession(undefined);
    expect(queries).toBe(0);

    await expect(destroySession("never-issued")).resolves.toBeUndefined();
  });
});

describe("destroyAllSessionsForUser", () => {
  it("ends every session of that user and none of anyone else's", async () => {
    const ana = [await createSession(ANA.id), await createSession(ANA.id)];
    const beto = await createSession(BETO.id);

    expect(await destroyAllSessionsForUser(ANA.id)).toBe(2);

    for (const session of ana) expect(await readSession(session.token)).toBeNull();
    expect(await readSession(beto.token)).toEqual({ id: BETO.id, email: BETO.email });
    expect(rows.size).toBe(1);
  });

  it("reports zero for a user with nothing to end", async () => {
    await createSession(BETO.id);
    expect(await destroyAllSessionsForUser(ANA.id)).toBe(0);
    expect(rows.size).toBe(1);
  });
});

describe("hashToken", () => {
  it("is plain SHA-256 hex, so the digest is a stable lookup key", () => {
    expect(hashToken("token")).toBe(sha256("token"));
    expect(hashToken("token")).toHaveLength(64);
    expect(hashToken("token")).not.toBe(hashToken("token "));
  });
});

describe("sessionCookieOptions", () => {
  it("hides the cookie from script and sends it for the whole app until the session expires", () => {
    const expiresAt = new Date("2026-10-04T12:00:00.000Z");
    expect(sessionCookieOptions(expiresAt)).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
  });

  // A secure cookie is simply not sent over plain http, which is what local development runs on,
  // and the symptom is a sign-in that appears to succeed and then bounces back to the form.
  it("marks the cookie secure in production only", () => {
    const expiresAt = new Date("2026-10-04T12:00:00.000Z");
    expect(sessionCookieOptions(expiresAt).secure).toBe(false);

    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookieOptions(expiresAt).secure).toBe(true);
  });

  it("names one cookie, so nothing has to repeat the string", () => {
    expect(SESSION_COOKIE).toBe("cecodes_session");
  });
});
