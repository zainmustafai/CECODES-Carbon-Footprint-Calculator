import { beforeEach, describe, expect, it, vi } from "vitest";

// CROSS-TENANT AUTHORIZATION, AT THE ACTION LEVEL.
//
// company-scope.test.ts proves the RESOLVERS refuse a foreign company. It does not prove that any
// action CALLS them, and until now nothing did: there was not a single test for any Server Action.
// A refactor that swapped resolveAdminScope for resolveCompanyScope in the admin actions would
// have let a company user delete other companies, and the whole suite would have stayed green.
//
// So: the real company-scope is used here (NOT mocked). Only the database and the Supabase admin
// client are stubbed. Each test signs in as company A and hands the action company B's ids, then
// asserts two things:
//   1. the action returns an opaque "forbidden", and
//   2. NOTHING was written. A refusal that still wrote would be worse than no refusal at all,
//      because it would look safe.

const COMPANY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMPANY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FACILITY_B = "ffffffff-bbbb-4bbb-8bbb-ffffffffffff";
const YEAR_B = "eeeeeeee-bbbb-4bbb-8bbb-eeeeeeeeeeee";
const USER_B = "dddddddd-bbbb-4bbb-8bbb-dddddddddddd";
const FACTOR_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

// Company A's OWN rows, used to prove a DEACTIVATED user is refused even on their own data.
// These must be well-formed uuids: the actions validate shape before they authorize, so a
// malformed id would return "invalidValue" and the test would never reach the boundary at all.
const FACILITY_A = "ffffffff-aaaa-4aaa-8aaa-ffffffffffff";
const YEAR_A = "eeeeeeee-aaaa-4aaa-8aaa-eeeeeeeeeeee";

const USER_A = {
  id: "user-a",
  email: "a@example.com",
  role: "COMPANY_USER" as const,
  companyId: COMPANY_A,
  active: true,
};

const getAppUser = vi.fn();
const getUser = vi.fn();

// Every write method any tenant-touching action can reach. If a test ends with one of these
// having been called, the boundary leaked.
const WRITES = [
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
] as const;

const MODELS = [
  "company",
  "facility",
  "reportingYear",
  "activityEntry",
  "categoryApplicability",
  "scopeTarget",
  "appUser",
  "emissionFactor",
  "emissionFactorChange",
  "emissionFactorVersion",
  "gridElectricityFactor",
] as const;

type PrismaMock = Record<string, Record<string, ReturnType<typeof vi.fn>>>;

const prismaMock: PrismaMock = {};
for (const model of MODELS) {
  prismaMock[model] = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  };
  for (const write of WRITES) prismaMock[model][write] = vi.fn();
}

vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_t, model: string) => {
        if (model === "$transaction") return vi.fn();
        return prismaMock[model];
      },
    },
  ),
}));

vi.mock("@/lib/auth/server", () => ({
  getAppUser: () => getAppUser(),
  getUser: () => getUser(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// The admin user actions reach for Supabase. They must never get that far in these tests.
const supabaseCreateUser = vi.fn();
const supabaseDeleteUser = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    auth: { admin: { createUser: supabaseCreateUser, deleteUser: supabaseDeleteUser } },
  }),
  findAuthUserIdByEmail: vi.fn(),
}));

const { createFacility, updateFacility, deleteFacility } = await import(
  "@/features/facilities/actions/facility-actions"
);
const { updateCompanyProfile } = await import("@/features/company/actions/company-actions");
const { saveScopeTarget } = await import("@/features/data-entry/actions/scope-targets");
const { deleteReportingYear } = await import("@/features/data-entry/actions/reporting-years");
const adminCompanies = await import("@/features/admin/actions/company-actions");
const adminUsers = await import("@/features/admin/actions/user-actions");
const adminFactors = await import("@/features/admin/actions/factor-actions");

/** Every write mock across every model. */
function allWriteMocks() {
  return MODELS.flatMap((model) => WRITES.map((write) => prismaMock[model][write]));
}

function expectNothingWritten() {
  for (const mock of allWriteMocks()) expect(mock).not.toHaveBeenCalled();
  expect(supabaseCreateUser).not.toHaveBeenCalled();
  expect(supabaseDeleteUser).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();

  // Signed in as company A.
  getAppUser.mockResolvedValue(USER_A);
  getUser.mockResolvedValue({ id: USER_A.id, email: USER_A.email });

  // Company B's rows exist and belong to company B. The resolvers derive ownership FROM THE ROW,
  // which is what defeats "my companyId plus your facilityId".
  prismaMock.facility.findUnique.mockResolvedValue({ companyId: COMPANY_B });
  prismaMock.reportingYear.findUnique.mockResolvedValue({
    id: YEAR_B,
    companyId: COMPANY_B,
    facilityId: FACILITY_B,
    year: 2024,
    gwpSet: "AR6",
  });
  // Company B exists, and is active. Existence must not be what saves us.
  prismaMock.company.findUnique.mockResolvedValue({ id: COMPANY_B, active: true });
});

describe("a company user cannot reach another company's FACILITIES", () => {
  it("refuses createFacility against a foreign companyId", async () => {
    const result = await createFacility({
      companyId: COMPANY_B,
      name: "Planta robada",
      location: "Bogotá",
    });

    expect(result).toEqual({ error: "forbidden" });
    expectNothingWritten();
  });

  it("refuses updateFacility on a foreign facility, even though the caller sends no companyId", async () => {
    // The attack this defeats: the caller cannot lie about the company, because the company is
    // read off the facility row itself.
    const result = await updateFacility({
      facilityId: FACILITY_B,
      name: "Renombrada",
      location: "Bogotá",
    });

    expect(result).toEqual({ error: "forbidden" });
    expectNothingWritten();
  });

  it("refuses deleteFacility on a foreign facility", async () => {
    const result = await deleteFacility({ facilityId: FACILITY_B });

    expect(result).toEqual({ error: "forbidden" });
    expectNothingWritten();
  });
});

describe("a company user cannot reach another company's REPORTING YEARS", () => {
  it("refuses deleteReportingYear on a foreign year", async () => {
    const result = await deleteReportingYear({ reportingYearId: YEAR_B });

    expect(result).toEqual({ error: "forbidden" });
    expectNothingWritten();
  });

  it("refuses saveScopeTarget on a foreign year", async () => {
    const result = await saveScopeTarget({
      reportingYearId: YEAR_B,
      scope: "SCOPE_1",
      targetTonnes: "100",
    });

    expect(result).toEqual({ error: "forbidden" });
    expectNothingWritten();
  });
});

describe("a company user cannot edit another company's PROFILE", () => {
  it("refuses updateCompanyProfile against a foreign companyId", async () => {
    const result = await updateCompanyProfile({
      companyId: COMPANY_B,
      name: "Secuestrada S.A.",
      sector: "energia",
      contactEmail: "attacker@example.com",
    });

    expect(result).toEqual({ error: "forbidden" });
    expectNothingWritten();
  });
});

// Admin actions authorize with resolveAdminScope, never resolveCompanyScope. If one of them were
// ever switched to the latter, a company user could administer companies. These are the tests that
// would catch it.
describe("a company user cannot reach ANY admin action", () => {
  it("refuses every company administration action", async () => {
    expect(await adminCompanies.createCompany({ name: "Mia" })).toEqual({ error: "forbidden" });
    expect(
      await adminCompanies.updateCompany({ companyId: COMPANY_B, name: "Tuya" }),
    ).toEqual({ error: "forbidden" });
    expect(
      await adminCompanies.setCompanyActive({ companyId: COMPANY_B, active: false }),
    ).toEqual({ error: "forbidden" });
    expect(await adminCompanies.deleteCompany({ companyId: COMPANY_B })).toEqual({
      error: "forbidden",
    });

    expectNothingWritten();
  });

  it("refuses every user administration action, and never reaches Supabase", async () => {
    expect(
      await adminUsers.createUser({
        email: "nuevo@example.com",
        tempPassword: "supersecret",
        role: "CECODES_ADMIN",
      }),
    ).toEqual({ error: "forbidden" });
    expect(
      await adminUsers.updateUser({ userId: USER_B, role: "CECODES_ADMIN" }),
    ).toEqual({ error: "forbidden" });
    expect(await adminUsers.setUserActive({ userId: USER_B, active: false })).toEqual({
      error: "forbidden",
    });
    expect(await adminUsers.deleteUser({ userId: USER_B })).toEqual({ error: "forbidden" });

    // Privilege escalation to CECODES_ADMIN must not even reach the auth provider.
    expectNothingWritten();
  });

  it("refuses every factor-library action, because the library is shared by every tenant", async () => {
    // A factor is global reference data. One tenant editing it would move every other tenant's
    // numbers, which is the widest blast radius in the product.
    expect(
      await adminFactors.setFactorActive({ factorId: FACTOR_ID, active: false }),
    ).toEqual({ error: "forbidden" });
    expect(
      await adminFactors.upsertGridFactor({ year: 2024, factor: "0.001", source: "hack" }),
    ).toEqual({ error: "forbidden" });
    expect(await adminFactors.deleteGridFactor({ year: 2024 })).toEqual({
      error: "forbidden",
    });

    expectNothingWritten();
  });
});

// A deactivated user keeps a valid Supabase session: `active` lives in Postgres, not in the JWT.
// Server Actions run no layout, so the /account-disabled redirect never fires for them. Refusing
// inside the resolvers is the only thing that makes deactivation immediate.
describe("a DEACTIVATED user is refused everywhere, even on their OWN company", () => {
  beforeEach(() => {
    getAppUser.mockResolvedValue({ ...USER_A, active: false });
    prismaMock.facility.findUnique.mockResolvedValue({ companyId: COMPANY_A });
    prismaMock.reportingYear.findUnique.mockResolvedValue({
      id: YEAR_A,
      companyId: COMPANY_A,
      facilityId: FACILITY_A,
      year: 2024,
      gwpSet: "AR6",
    });
    prismaMock.company.findUnique.mockResolvedValue({ id: COMPANY_A, active: true });
  });

  it("cannot create a facility on their own company", async () => {
    const result = await createFacility({
      companyId: COMPANY_A,
      name: "Planta",
      location: "Cali",
    });

    expect(result).toEqual({ error: "forbidden" });
    expectNothingWritten();
  });

  it("cannot edit their own company profile", async () => {
    const result = await updateCompanyProfile({ companyId: COMPANY_A, name: "Nueva" });

    expect(result).toEqual({ error: "forbidden" });
    expectNothingWritten();
  });

  it("cannot save a target on their own reporting year", async () => {
    const result = await saveScopeTarget({
      reportingYearId: YEAR_A,
      scope: "SCOPE_1",
      targetTonnes: "10",
    });

    expect(result).toEqual({ error: "forbidden" });
    expectNothingWritten();
  });

  it("cannot delete their own facility", async () => {
    const result = await deleteFacility({ facilityId: FACILITY_A });

    expect(result).toEqual({ error: "forbidden" });
    expectNothingWritten();
  });
});

// A session with no app_users row at all (the signup trigger has not landed, or the profile was
// deleted) must not be treated as "some company".
describe("a session with no profile row writes nothing", () => {
  beforeEach(() => {
    getAppUser.mockResolvedValue(null);
  });

  it("is refused", async () => {
    expect(
      await createFacility({ companyId: COMPANY_A, name: "X", location: "Y" }),
    ).toEqual({ error: "forbidden" });
    expect(await deleteFacility({ facilityId: FACILITY_B })).toEqual({ error: "forbidden" });

    expectNothingWritten();
  });
});
