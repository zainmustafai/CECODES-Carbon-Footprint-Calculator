import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getUser() is the seam every guard in the app stands on: company-scope.ts, requireAdmin(), each
// page shell and each Server Action all end up here, and all of them mock THIS module rather than
// an auth provider. So the one thing no other test can prove is the thing under test here - that
// the provider flag decides which credential store is asked, and that the other one is never
// reached. A local deployment that quietly fell back to GoTrue would still sign users in, which is
// exactly why it would go unnoticed.
//
// react's cache() is a pass-through outside a request, so each test below gets a fresh read rather
// than the previous test's memoized answer.

const readSession = vi.fn();
const supabaseGetUser = vi.fn();
const createSupabaseClient = vi.fn(async () => ({ auth: { getUser: supabaseGetUser } }));
const cookieGet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => cookieGet(name) }),
}));

// The real SESSION_COOKIE is kept: a test that asserted against its own copy of the name would
// pass while the app read a cookie the sign-in never set.
vi.mock("@/lib/auth/session", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/auth/session")>()),
  readSession: (token: string | null | undefined) => readSession(token),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: () => createSupabaseClient() }));

// Imported at module scope by getAppUser/companyIsActive. Nothing here reaches it, and a real
// client would open a connection pool to the shared database.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { SESSION_COOKIE } = await import("@/lib/auth/session");
const { getUser } = await import("@/lib/auth/server");

const LOCAL_USER = { id: "u-local", email: "local@example.org" };
const GOTRUE_USER = { id: "u-gotrue", email: "gotrue@example.org" };

const originalProvider = process.env.AUTH_PROVIDER;

function useProvider(value: string | undefined) {
  if (value === undefined) delete process.env.AUTH_PROVIDER;
  else process.env.AUTH_PROVIDER = value;
}

beforeEach(() => {
  vi.clearAllMocks();
  cookieGet.mockReturnValue(undefined);
  readSession.mockResolvedValue(null);
  supabaseGetUser.mockResolvedValue({ data: { user: null } });
});

afterEach(() => {
  useProvider(originalProvider);
});

describe("getUser, local provider", () => {
  beforeEach(() => {
    useProvider("local");
  });

  it("resolves the session cookie to the user holding it", async () => {
    cookieGet.mockReturnValue({ name: SESSION_COOKIE, value: "token-abc" });
    readSession.mockResolvedValue(LOCAL_USER);

    expect(await getUser()).toEqual(LOCAL_USER);
    expect(cookieGet).toHaveBeenCalledWith(SESSION_COOKIE);
    expect(readSession).toHaveBeenCalledWith("token-abc");
  });

  it("returns null when the browser carries no session cookie", async () => {
    expect(await getUser()).toBeNull();
    expect(readSession).toHaveBeenCalledWith(undefined);
  });

  it("returns null when the cookie names a session the store does not honour", async () => {
    cookieGet.mockReturnValue({ name: SESSION_COOKIE, value: "expired-or-forged" });

    expect(await getUser()).toBeNull();
  });

  it("never asks Supabase, even when GoTrue would answer with somebody else", async () => {
    cookieGet.mockReturnValue({ name: SESSION_COOKIE, value: "token-abc" });
    readSession.mockResolvedValue(LOCAL_USER);
    supabaseGetUser.mockResolvedValue({ data: { user: GOTRUE_USER } });

    expect(await getUser()).toEqual(LOCAL_USER);
    expect(createSupabaseClient).not.toHaveBeenCalled();
    expect(supabaseGetUser).not.toHaveBeenCalled();
  });

  it("still refuses when GoTrue would have signed the visitor in", async () => {
    supabaseGetUser.mockResolvedValue({ data: { user: GOTRUE_USER } });

    expect(await getUser()).toBeNull();
    expect(createSupabaseClient).not.toHaveBeenCalled();
  });
});

describe("getUser, supabase provider", () => {
  it("reads GoTrue and never touches the local session store", async () => {
    useProvider("supabase");
    supabaseGetUser.mockResolvedValue({ data: { user: GOTRUE_USER } });

    expect(await getUser()).toEqual(GOTRUE_USER);
    expect(supabaseGetUser).toHaveBeenCalled();
    expect(readSession).not.toHaveBeenCalled();
  });

  it("is what an unset AUTH_PROVIDER means, so a deployment that never heard of the migration keeps working", async () => {
    useProvider(undefined);
    supabaseGetUser.mockResolvedValue({ data: { user: GOTRUE_USER } });

    expect(await getUser()).toEqual(GOTRUE_USER);
    expect(readSession).not.toHaveBeenCalled();
  });

  it("keeps deciding identity in shadow mode, where only the password check is doubled up", async () => {
    useProvider("shadow");
    supabaseGetUser.mockResolvedValue({ data: { user: GOTRUE_USER } });

    expect(await getUser()).toEqual(GOTRUE_USER);
    expect(readSession).not.toHaveBeenCalled();
  });

  it("returns null when GoTrue has no user for the request", async () => {
    useProvider("supabase");

    expect(await getUser()).toBeNull();
  });

  it("narrows the Supabase user to the two fields the app authorizes on", async () => {
    useProvider("supabase");
    supabaseGetUser.mockResolvedValue({
      data: {
        user: { ...GOTRUE_USER, app_metadata: { provider: "email" }, aud: "authenticated" },
      },
    });

    expect(await getUser()).toEqual(GOTRUE_USER);
  });

  it("refuses a Supabase user with no email, rather than inventing an address for it", async () => {
    useProvider("supabase");
    supabaseGetUser.mockResolvedValue({ data: { user: { id: "u-phone-only" } } });

    expect(await getUser()).toBeNull();
  });
});
