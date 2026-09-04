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
const appUserFindUnique = vi.fn();
const companyFindUnique = vi.fn();

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

// appUser.findUnique is faked because getAppUser (requireAdmin's route to a role) reads it, and
// company.findUnique is faked because companyIsActive reads it. Every other query this module
// might make is untouched by the tests below and would throw if it were ever reached, the same
// way the bare `{}` used to.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    appUser: { findUnique: appUserFindUnique },
    company: { findUnique: companyFindUnique },
  },
}));

// requireAdmin() answers a non-admin with notFound(), never a redirect (see the comment on
// requireAdmin in server.ts): a 404 does not confirm the admin area exists, and it cannot loop.
// Real Next.js notFound()/redirect() both throw to interrupt rendering, which is why these do too;
// a mock that returned normally would let requireAdmin fall through and return the refused user.
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  redirect: (url: string) => redirect(url),
}));

const USER = { id: "u-local", email: "local@example.org" };

beforeEach(() => {
  vi.clearAllMocks();
  cookieValue = undefined;
  readSession.mockResolvedValue(null);
  appUserFindUnique.mockResolvedValue(null);
  companyFindUnique.mockResolvedValue(null);
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

describe("requireUser", () => {
  it("redirects an anonymous caller to /login rather than returning one", async () => {
    const { requireUser } = await import("@/lib/auth/server");
    cookieValue = undefined;

    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});

describe("getAppUser", () => {
  it("resolves to null without querying the profile row when there is no session", async () => {
    const { getAppUser } = await import("@/lib/auth/server");
    cookieValue = undefined;

    expect(await getAppUser()).toBeNull();
    expect(appUserFindUnique).not.toHaveBeenCalled();
  });
});

describe("requireAppUser", () => {
  it("redirects a deactivated user to /account-disabled instead of returning their profile", async () => {
    const { requireAppUser } = await import("@/lib/auth/server");
    cookieValue = "token-abc";
    readSession.mockResolvedValue(USER);
    appUserFindUnique.mockResolvedValue({
      id: USER.id,
      email: USER.email,
      role: "COMPANY_USER",
      active: false,
      companyId: "company-1",
    });

    await expect(requireAppUser()).rejects.toThrow("NEXT_REDIRECT:/account-disabled");
    expect(redirect).toHaveBeenCalledWith("/account-disabled");
  });
});

describe("requireAdmin", () => {
  it("AUTH-30 refuses a signed-in company user through notFound(), not a redirect", async () => {
    const { requireAdmin } = await import("@/lib/auth/server");
    cookieValue = "token-abc";
    readSession.mockResolvedValue(USER);
    // Active and signed in, so this is not the /account-disabled redirect requireAppUser would
    // otherwise take; the only thing wrong with this caller is the role.
    appUserFindUnique.mockResolvedValue({
      id: USER.id,
      email: USER.email,
      role: "COMPANY_USER",
      active: true,
      companyId: "company-1",
    });

    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalledTimes(1);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("resolves an active CECODES admin instead of refusing them", async () => {
    const { requireAdmin } = await import("@/lib/auth/server");
    cookieValue = "token-abc";
    readSession.mockResolvedValue(USER);
    const admin = {
      id: USER.id,
      email: USER.email,
      role: "CECODES_ADMIN",
      active: true,
      companyId: null,
    };
    appUserFindUnique.mockResolvedValue(admin);

    await expect(requireAdmin()).resolves.toEqual(admin);
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe("companyIsActive", () => {
  it("is true for a company on record as active", async () => {
    const { companyIsActive } = await import("@/lib/auth/server");
    companyFindUnique.mockResolvedValue({ active: true });

    expect(await companyIsActive("company-1")).toBe(true);
    expect(companyFindUnique).toHaveBeenCalledWith({
      where: { id: "company-1" },
      select: { active: true },
    });
  });

  it("is false for a deactivated company", async () => {
    const { companyIsActive } = await import("@/lib/auth/server");
    companyFindUnique.mockResolvedValue({ active: false });

    expect(await companyIsActive("company-1")).toBe(false);
  });

  it("is false, rather than throwing, when the company row does not exist", async () => {
    const { companyIsActive } = await import("@/lib/auth/server");
    companyFindUnique.mockResolvedValue(null);

    expect(await companyIsActive("ghost")).toBe(false);
  });
});
