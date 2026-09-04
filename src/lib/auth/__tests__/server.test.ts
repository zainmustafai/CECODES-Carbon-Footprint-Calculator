import { beforeEach, describe, expect, it, vi } from "vitest";

// getUser() is the one place a cookie becomes an identity: company-scope.ts, requireAdmin(), each
// page shell and each Server Action all end up here, and all of them mock THIS module rather than
// the session store underneath it. What only this file can prove is that a cookie with no
// matching session, or none at all, resolves to signed out and never throws.
//
// react's cache() is a pass-through outside a request, so each test below gets a fresh read rather
// than the previous test's memoized answer.

let cookieValue: string | undefined;
const readSession = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (cookieValue === undefined ? undefined : { value: cookieValue }),
  }),
}));

// readSession is replaced; every other export of the module, SESSION_COOKIE included, is real.
vi.mock("@/lib/auth/session", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/auth/session")>()),
  readSession: (token: string | null | undefined) => readSession(token),
}));

// Imported at module scope by getAppUser/companyIsActive. Nothing here reaches it, and a real
// client would open a connection pool to the shared database.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const USER = { id: "u-local", email: "local@example.org" };

beforeEach(() => {
  vi.clearAllMocks();
  cookieValue = undefined;
  readSession.mockResolvedValue(null);
});

describe("getUser", () => {
  it("resolves the session cookie to the user holding it", async () => {
    const { getUser } = await import("@/lib/auth/server");
    cookieValue = "token-abc";
    readSession.mockResolvedValue(USER);

    expect(await getUser()).toEqual(USER);
    expect(readSession).toHaveBeenCalledWith("token-abc");
  });

  it("AUTH-22 resolves a forged cookie value to null", async () => {
    const { getUser } = await import("@/lib/auth/server");
    cookieValue = "not-a-real-token";
    expect(await getUser()).toBeNull();
  });

  it("AUTH-23 resolves an absent cookie to null", async () => {
    const { getUser } = await import("@/lib/auth/server");
    cookieValue = undefined;
    expect(await getUser()).toBeNull();
  });
});
