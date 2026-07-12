import { beforeEach, describe, expect, it, vi } from "vitest";

// Prisma bypasses RLS in this app, so resolveCompanyScope IS the isolation boundary.
// These tests are the only automated proof that it holds.
const findUniqueCompany = vi.fn();
const findUniqueReportingYear = vi.fn();
const findUniqueFacility = vi.fn();
const getAppUser = vi.fn();
const getUser = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findUnique: (...args: unknown[]) => findUniqueCompany(...args) },
    reportingYear: { findUnique: (...args: unknown[]) => findUniqueReportingYear(...args) },
    facility: { findUnique: (...args: unknown[]) => findUniqueFacility(...args) },
  },
}));

vi.mock("@/lib/auth/server", () => ({
  getAppUser: () => getAppUser(),
  getUser: () => getUser(),
}));

const {
  ScopeError,
  resolveAdminScope,
  resolveCompanyScope,
  resolveOnboardingScope,
  resolveReportingYearScope,
  scopeErrorKey,
} = await import("@/lib/auth/company-scope");

const ADMIN = { id: "u-admin", role: "CECODES_ADMIN", companyId: null, active: true };
const USER_A = { id: "u-a", role: "COMPANY_USER", companyId: "company-a", active: true };
const UNONBOARDED = { id: "u-x", role: "COMPANY_USER", companyId: null, active: true };
const INACTIVE_ADMIN = { ...ADMIN, active: false };
const INACTIVE_USER = { ...USER_A, active: false };

const ACTIVE_COMPANY = { id: "company-a", active: true };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveCompanyScope: admin", () => {
  it("may open any company that exists", async () => {
    getAppUser.mockResolvedValue(ADMIN);
    findUniqueCompany.mockResolvedValue({ id: "company-b" });

    const scope = await resolveCompanyScope({ companyId: "company-b" });

    expect(scope).toMatchObject({ companyId: "company-b", isAdmin: true });
  });

  it("is refused a company that does not exist", async () => {
    getAppUser.mockResolvedValue(ADMIN);
    findUniqueCompany.mockResolvedValue(null);

    await expect(resolveCompanyScope({ companyId: "ghost" })).rejects.toThrow(ScopeError);
  });

  it("is refused when no company is named, and never falls back to their null companyId", async () => {
    getAppUser.mockResolvedValue(ADMIN);

    // Prisma would turn a null companyId into `WHERE "companyId" IS NULL`, which matches
    // nothing rather than everything. Throwing is the only safe answer.
    await expect(resolveCompanyScope({ companyId: null })).rejects.toThrow(ScopeError);
    await expect(resolveCompanyScope({ companyId: undefined })).rejects.toThrow(ScopeError);
    expect(findUniqueCompany).not.toHaveBeenCalled();
  });

  it("may still open an INACTIVE company, so it can be fixed and reactivated", async () => {
    getAppUser.mockResolvedValue(ADMIN);
    findUniqueCompany.mockResolvedValue({ id: "company-b" });

    const scope = await resolveCompanyScope({ companyId: "company-b" });

    expect(scope.isAdmin).toBe(true);
  });

  it("is refused once the admin themselves is deactivated", async () => {
    getAppUser.mockResolvedValue(INACTIVE_ADMIN);

    await expect(resolveCompanyScope({ companyId: "company-b" })).rejects.toThrow(ScopeError);
    expect(findUniqueCompany).not.toHaveBeenCalled();
  });
});

describe("resolveCompanyScope: company user", () => {
  it("may open their own company", async () => {
    getAppUser.mockResolvedValue(USER_A);
    findUniqueCompany.mockResolvedValue(ACTIVE_COMPANY);

    const scope = await resolveCompanyScope({ companyId: "company-a" });

    expect(scope).toMatchObject({ companyId: "company-a", isAdmin: false });
  });

  it("is refused another company, even one that exists", async () => {
    getAppUser.mockResolvedValue(USER_A);
    findUniqueCompany.mockResolvedValue({ id: "company-b", active: true });

    await expect(resolveCompanyScope({ companyId: "company-b" })).rejects.toThrow(ScopeError);
  });

  it("falls back to their own company when the caller names none", async () => {
    getAppUser.mockResolvedValue(USER_A);
    findUniqueCompany.mockResolvedValue(ACTIVE_COMPANY);

    const scope = await resolveCompanyScope({ companyId: null });

    expect(scope.companyId).toBe("company-a");
  });

  it("is refused before onboarding, when they have no company", async () => {
    getAppUser.mockResolvedValue(UNONBOARDED);

    await expect(resolveCompanyScope({ companyId: "company-a" })).rejects.toThrow(ScopeError);
  });

  it("is refused when their own user row is deactivated", async () => {
    getAppUser.mockResolvedValue(INACTIVE_USER);

    await expect(resolveCompanyScope({ companyId: "company-a" })).rejects.toThrow(ScopeError);
  });

  it("is refused when their company is deactivated", async () => {
    getAppUser.mockResolvedValue(USER_A);
    findUniqueCompany.mockResolvedValue({ id: "company-a", active: false });

    await expect(resolveCompanyScope({ companyId: "company-a" })).rejects.toThrow(ScopeError);
  });

  it("is refused when their company row has vanished", async () => {
    getAppUser.mockResolvedValue(USER_A);
    findUniqueCompany.mockResolvedValue(null);

    await expect(resolveCompanyScope({ companyId: "company-a" })).rejects.toThrow(ScopeError);
  });
});

describe("resolveCompanyScope: no profile", () => {
  it("is refused when the session exists but the app_users row does not", async () => {
    getAppUser.mockResolvedValue(null);

    await expect(resolveCompanyScope({ companyId: "company-a" })).rejects.toThrow(ScopeError);
  });
});

describe("resolveAdminScope", () => {
  it("accepts an active admin", async () => {
    getAppUser.mockResolvedValue(ADMIN);

    const scope = await resolveAdminScope();

    expect(scope.appUser.id).toBe("u-admin");
  });

  it("refuses a company user", async () => {
    getAppUser.mockResolvedValue(USER_A);

    await expect(resolveAdminScope()).rejects.toThrow(ScopeError);
  });

  it("refuses a deactivated admin", async () => {
    getAppUser.mockResolvedValue(INACTIVE_ADMIN);

    await expect(resolveAdminScope()).rejects.toThrow(ScopeError);
  });

  it("refuses a session with no profile row", async () => {
    getAppUser.mockResolvedValue(null);

    await expect(resolveAdminScope()).rejects.toThrow(ScopeError);
  });
});

// Onboarding runs BEFORE a company exists, so it cannot go through resolveCompanyScope.
// createCompanyAction used to call requireUser(), which validates the Supabase session but
// never reads app_users.active. Because a Server Action runs no layout, the /account-disabled
// redirect never fired for it, so a deactivated user who had never been onboarded could POST
// it and create a company. These tests are the regression guard.
describe("resolveOnboardingScope", () => {
  const SESSION = { id: "u-x", email: "x@example.com" };

  it("accepts an active, unonboarded user", async () => {
    getUser.mockResolvedValue(SESSION);
    getAppUser.mockResolvedValue(UNONBOARDED);

    const scope = await resolveOnboardingScope();

    expect(scope).toMatchObject({ userId: "u-x", email: "x@example.com" });
    expect(scope.appUser).toMatchObject({ active: true });
  });

  it("accepts a session whose profile row does not exist yet, so the action can self-heal it", async () => {
    // The signup trigger is INSERT-only and may not have run. That is legitimate.
    getUser.mockResolvedValue(SESSION);
    getAppUser.mockResolvedValue(null);

    const scope = await resolveOnboardingScope();

    expect(scope.appUser).toBeNull();
    expect(scope.userId).toBe("u-x");
  });

  it("REFUSES a deactivated user who was never onboarded", async () => {
    // The whole point. A deactivated user may still hold a valid Supabase session; the flag
    // lives in Postgres, not the JWT. Without this they could create a company for themselves.
    getUser.mockResolvedValue(SESSION);
    getAppUser.mockResolvedValue({ ...UNONBOARDED, active: false });

    await expect(resolveOnboardingScope()).rejects.toThrow(ScopeError);
  });

  it("refuses a deactivated user who already has a company", async () => {
    getUser.mockResolvedValue(SESSION);
    getAppUser.mockResolvedValue(INACTIVE_USER);

    await expect(resolveOnboardingScope()).rejects.toThrow(ScopeError);
  });

  it("refuses when there is no session at all", async () => {
    getUser.mockResolvedValue(null);

    await expect(resolveOnboardingScope()).rejects.toThrow(ScopeError);
    // It must not even look at the profile row.
    expect(getAppUser).not.toHaveBeenCalled();
  });

  it("does not treat an already-onboarded user as an authorization failure", async () => {
    // Being onboarded already is a domain error (alreadyOnboarded), reported by the action.
    getUser.mockResolvedValue(SESSION);
    getAppUser.mockResolvedValue(USER_A);

    const scope = await resolveOnboardingScope();

    expect(scope.appUser).toMatchObject({ companyId: "company-a" });
  });
});

describe("resolveReportingYearScope", () => {
  it("derives the company from the row, so a foreign year is refused", async () => {
    getAppUser.mockResolvedValue(USER_A);
    // The attacker owns company-a but passes company-b's reporting year.
    findUniqueReportingYear.mockResolvedValue({
      id: "ry-b",
      companyId: "company-b",
      facilityId: "f-b",
      year: 2024,
      gwpSet: "AR6",
    });

    await expect(resolveReportingYearScope("ry-b")).rejects.toThrow(ScopeError);
  });

  it("accepts a year belonging to the caller's own company", async () => {
    getAppUser.mockResolvedValue(USER_A);
    findUniqueCompany.mockResolvedValue(ACTIVE_COMPANY);
    findUniqueReportingYear.mockResolvedValue({
      id: "ry-a",
      companyId: "company-a",
      facilityId: "f-a",
      year: 2024,
      gwpSet: "AR6",
    });

    const scope = await resolveReportingYearScope("ry-a");

    expect(scope.companyId).toBe("company-a");
    expect(scope.reportingYear.id).toBe("ry-a");
  });

  it("refuses a reporting year that does not exist", async () => {
    getAppUser.mockResolvedValue(USER_A);
    findUniqueReportingYear.mockResolvedValue(null);

    await expect(resolveReportingYearScope("ghost")).rejects.toThrow(ScopeError);
  });

  it("lets an admin reach any company's year", async () => {
    getAppUser.mockResolvedValue(ADMIN);
    findUniqueReportingYear.mockResolvedValue({
      id: "ry-b",
      companyId: "company-b",
      facilityId: "f-b",
      year: 2024,
      gwpSet: "AR6",
    });
    findUniqueCompany.mockResolvedValue({ id: "company-b" });

    const scope = await resolveReportingYearScope("ry-b");

    expect(scope).toMatchObject({ companyId: "company-b", isAdmin: true });
  });
});

describe("scopeErrorKey", () => {
  it("collapses every reason into one opaque key, so responses do not leak existence", () => {
    expect(scopeErrorKey(new ScopeError("forbidden"))).toBe("forbidden");
    expect(scopeErrorKey(new ScopeError("not-found"))).toBe("forbidden");
    expect(scopeErrorKey(new ScopeError("no-profile"))).toBe("forbidden");
    expect(scopeErrorKey(new Error("database is on fire"))).toBe("generic");
  });
});
