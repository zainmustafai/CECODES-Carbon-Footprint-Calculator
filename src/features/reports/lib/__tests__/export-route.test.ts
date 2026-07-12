import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// THE EXPORT ROUTE IS A PUBLIC ENDPOINT THAT HANDS OUT A COMPANY'S ENTIRE FOOTPRINT AS A FILE.
//
// A Route Handler runs no layout, so requireAppUser() and requireAdmin() never execute for it. It
// is exactly as exposed as a Server Action, and RLS will not save it (Prisma connects as the
// database owner and bypasses every policy). The only thing standing between company A and company
// B's data is that this route calls resolveCompanyScope before it touches Prisma.
//
// These tests use the REAL company-scope. Only the database is stubbed.

const COMPANY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMPANY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FACILITY_A = "ffffffff-aaaa-4aaa-8aaa-ffffffffffff";
const FACILITY_B = "ffffffff-bbbb-4bbb-8bbb-ffffffffffff";

const USER_A = {
  id: "user-a",
  email: "a@example.com",
  role: "COMPANY_USER" as const,
  companyId: COMPANY_A,
  active: true,
};

const getAppUser = vi.fn();
const getUser = vi.fn();

const prismaMock = {
  company: { findUnique: vi.fn() },
  facility: { findFirst: vi.fn() },
  reportingYear: { findFirst: vi.fn() },
  activityEntry: { findMany: vi.fn() },
  gridElectricityFactor: { findUnique: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth/server", () => ({
  getAppUser: () => getAppUser(),
  getUser: () => getUser(),
}));

const { GET } = await import("@/app/api/reports/export/route");

function request(params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  return new NextRequest(`http://localhost/api/reports/export?${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  getAppUser.mockResolvedValue(USER_A);
  getUser.mockResolvedValue({ id: USER_A.id, email: USER_A.email });

  prismaMock.company.findUnique.mockResolvedValue({ id: COMPANY_A, name: "Empresa A", active: true });
  prismaMock.reportingYear.findFirst.mockResolvedValue({ id: "ry", year: 2024, gwpSet: "AR6" });
  prismaMock.activityEntry.findMany.mockResolvedValue([]);
  prismaMock.gridElectricityFactor.findUnique.mockResolvedValue(null);

  // findFirst is scoped on { id, companyId } in loadReport, so it only matches when the facility
  // really belongs to the resolved company. Model that here.
  prismaMock.facility.findFirst.mockImplementation(
    async (args: { where: { id: string; companyId: string } }) =>
      args.where.id === FACILITY_A && args.where.companyId === COMPANY_A
        ? { name: "Planta A" }
        : null,
  );
});

describe("GET /api/reports/export: authorization", () => {
  it("REFUSES a company user who names another company, and never queries the data", async () => {
    const response = await GET(
      request({ companyId: COMPANY_B, facilityId: FACILITY_B, year: "2024" }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });

    // The refusal happened BEFORE any data was read. If these had run, the guard would be in the
    // wrong place even though the status code looked right.
    expect(prismaMock.activityEntry.findMany).not.toHaveBeenCalled();
    expect(prismaMock.facility.findFirst).not.toHaveBeenCalled();
  });

  it("REFUSES a foreign facility even when the caller sends no companyId at all", async () => {
    // The subtler attack: omit companyId so the caller resolves to their OWN company, then pass
    // someone else's facilityId and hope the loader trusts it. loadReport re-scopes the facility
    // on the RESOLVED companyId, so it finds nothing.
    const response = await GET(request({ facilityId: FACILITY_B, year: "2024" }));

    expect(response.status).toBe(404);
    // It must not leak that the facility exists somewhere else.
    await expect(response.json()).resolves.toEqual({ error: "notFound" });
  });

  it("refuses a session with no profile row", async () => {
    getAppUser.mockResolvedValue(null);

    const response = await GET(request({ facilityId: FACILITY_A, year: "2024" }));

    expect(response.status).toBe(403);
    expect(prismaMock.activityEntry.findMany).not.toHaveBeenCalled();
  });

  it("refuses a DEACTIVATED user, whose Supabase session is still perfectly valid", async () => {
    getAppUser.mockResolvedValue({ ...USER_A, active: false });

    const response = await GET(request({ facilityId: FACILITY_A, year: "2024" }));

    expect(response.status).toBe(403);
    expect(prismaMock.activityEntry.findMany).not.toHaveBeenCalled();
  });

  it("rejects a malformed request before doing anything else", async () => {
    expect((await GET(request({ facilityId: "not-a-uuid", year: "2024" }))).status).toBe(400);
    expect((await GET(request({ facilityId: FACILITY_A, year: "abc" }))).status).toBe(400);
    // .strict(): an unknown key must not ride along.
    expect(
      (await GET(request({ facilityId: FACILITY_A, year: "2024", admin: "true" }))).status,
    ).toBe(400);
  });
});

describe("GET /api/reports/export: the happy path", () => {
  it("serves an .xlsx with a download filename, and does not cache a footprint", async () => {
    const response = await GET(request({ facilityId: FACILITY_A, year: "2024" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect(response.headers.get("content-disposition")).toMatch(/attachment; filename=".*\.xlsx"/);
    // The numbers are computed live from the current factor library. A cached footprint would be
    // served stale the moment an admin corrects a factor.
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("serves a CSV when asked", async () => {
    const response = await GET(
      request({ facilityId: FACILITY_A, year: "2024", format: "csv" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(await response.text()).toContain("Alcance");
  });

  it("404s a year the company does not have, rather than an empty workbook", async () => {
    prismaMock.reportingYear.findFirst.mockResolvedValue(null);

    const response = await GET(request({ facilityId: FACILITY_A, year: "1999" }));

    expect(response.status).toBe(404);
  });
});
