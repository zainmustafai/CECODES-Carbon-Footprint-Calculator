import { beforeEach, describe, expect, it, vi } from "vitest";

// loadDashboard's scope filter is now a Scope[] (see types.ts), not a single Scope | null. This
// file proves the multi-scope generalization is a true union: filtering to two scopes must equal
// exactly the sum of filtering to each scope alone, never more (double-counting a row) and never
// less (silently dropping one) - the same property the code comments in dashboard-data.ts claim.
//
// activityEntry.findMany's `where` only narrows by reportingYearId, never by scope (the scope
// refinement happens in-memory, after the fetch), so one fixed fixture answers every call below
// regardless of which `requested.scope` loadDashboard is asked for.

const findUniqueCompany = vi.fn();
const findManyFacility = vi.fn();
const findManyReportingYear = vi.fn();
const findManyActivityEntry = vi.fn();
const findManyGridFactor = vi.fn();
const findManySubsidyPrice = vi.fn();
const findUniqueCompanyTarget = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findUnique: (...args: unknown[]) => findUniqueCompany(...args) },
    facility: { findMany: (...args: unknown[]) => findManyFacility(...args) },
    reportingYear: { findMany: (...args: unknown[]) => findManyReportingYear(...args) },
    activityEntry: { findMany: (...args: unknown[]) => findManyActivityEntry(...args) },
    gridElectricityFactor: { findMany: (...args: unknown[]) => findManyGridFactor(...args) },
    transportSubsidyPrice: { findMany: (...args: unknown[]) => findManySubsidyPrice(...args) },
    companyTarget: { findUnique: (...args: unknown[]) => findUniqueCompanyTarget(...args) },
  },
}));

const { loadDashboard } = await import("../dashboard-data");

const COMPANY_ID = "company-1";
const FACILITY_ID = "facility-1";
const REPORTING_YEAR_ID = "ry-2024";
const YEAR = 2024;
const UPDATED_AT = new Date("2026-01-01T00:00:00Z");

// One entry per scope, plus a second SCOPE_1 entry so SCOPE_1's own category has two elements -
// enough to exercise both byCategory and byElement without needing more than four rows.
const ENTRIES = [
  {
    reportingYearId: REPORTING_YEAR_ID,
    scope: "SCOPE_1",
    category: "Combustión fija",
    subcategory: null,
    element: "Diesel",
    month: null,
    value: "10",
    secondaryValue: null,
    updatedAt: UPDATED_AT,
    emissionFactor: {
      co2Factor: null,
      ch4Factor: null,
      n2oFactor: null,
      co2eFactor: "100", // kg CO2e / unit, pre-blended so the math is activity * factor / 1000
      biogenic: false,
      entryMode: "QUANTITY",
    },
  },
  {
    reportingYearId: REPORTING_YEAR_ID,
    scope: "SCOPE_1",
    category: "Combustión fija",
    subcategory: null,
    element: "Gasolina",
    month: null,
    value: "5",
    secondaryValue: null,
    updatedAt: UPDATED_AT,
    emissionFactor: {
      co2Factor: null,
      ch4Factor: null,
      n2oFactor: null,
      co2eFactor: "100",
      biogenic: false,
      entryMode: "QUANTITY",
    },
  },
  {
    reportingYearId: REPORTING_YEAR_ID,
    scope: "SCOPE_2",
    category: "Consumo eléctrico",
    subcategory: null,
    element: "SISTEMA INTERCONECTADO NACIONAL - SIN",
    month: 1,
    value: "1000", // kWh
    secondaryValue: null,
    updatedAt: UPDATED_AT,
    emissionFactor: null, // Scope 2 is priced from the grid factor, never a per-row factor
  },
  {
    reportingYearId: REPORTING_YEAR_ID,
    scope: "SCOPE_3",
    category: "Transporte de personal",
    subcategory: null,
    element: "Bus",
    month: null,
    value: "8",
    secondaryValue: null,
    updatedAt: UPDATED_AT,
    emissionFactor: {
      co2Factor: null,
      ch4Factor: null,
      n2oFactor: null,
      co2eFactor: "50",
      biogenic: false,
      entryMode: "QUANTITY",
    },
  },
];

// SCOPE_1: (10 + 5) * 100 / 1000 = 1.5 t. SCOPE_2: 1000 * 0.5 / 1000 = 0.5 t. SCOPE_3:
// 8 * 50 / 1000 = 0.4 t.
const GRID_FACTOR = "0.5"; // kg CO2 / kWh

beforeEach(() => {
  vi.clearAllMocks();
  findUniqueCompany.mockResolvedValue({ name: "Empresa de prueba", sector: null });
  findManyFacility.mockResolvedValue([{ id: FACILITY_ID, name: "Sede 1" }]);
  findManyReportingYear.mockResolvedValue([
    { id: REPORTING_YEAR_ID, facilityId: FACILITY_ID, year: YEAR, gwpSet: "AR6" },
  ]);
  findManyActivityEntry.mockResolvedValue(ENTRIES);
  findManyGridFactor.mockResolvedValue([{ year: YEAR, factor: GRID_FACTOR }]);
  findManySubsidyPrice.mockResolvedValue([]);
  findUniqueCompanyTarget.mockResolvedValue(null);
});

describe("loadDashboard: multi-scope filter", () => {
  it("sums to the SAME total as no filter at all when every scope is checked", async () => {
    const unfiltered = await loadDashboard(COMPANY_ID, { scope: [] });
    const allThree = await loadDashboard(COMPANY_ID, {
      scope: ["SCOPE_1", "SCOPE_2", "SCOPE_3"],
    });

    expect(unfiltered.current!.total).toBeCloseTo(2.4, 6);
    expect(allThree.current!.total).toBeCloseTo(unfiltered.current!.total, 6);
  });

  it("a 2-scope selection's total is exactly the sum of each scope filtered alone", async () => {
    const scope1 = await loadDashboard(COMPANY_ID, { scope: ["SCOPE_1"] });
    const scope3 = await loadDashboard(COMPANY_ID, { scope: ["SCOPE_3"] });
    const both = await loadDashboard(COMPANY_ID, { scope: ["SCOPE_1", "SCOPE_3"] });

    expect(scope1.current!.total).toBeCloseTo(1.5, 6);
    expect(scope3.current!.total).toBeCloseTo(0.4, 6);
    expect(both.current!.total).toBeCloseTo(
      scope1.current!.total + scope3.current!.total,
      6,
    );
  });

  it("byCategory for a 2-scope selection is the union of each scope's own categories, no dupes", async () => {
    const scope1 = await loadDashboard(COMPANY_ID, { scope: ["SCOPE_1"] });
    const scope3 = await loadDashboard(COMPANY_ID, { scope: ["SCOPE_3"] });
    const both = await loadDashboard(COMPANY_ID, { scope: ["SCOPE_1", "SCOPE_3"] });

    const namesOf = (vm: typeof scope1) =>
      vm.current!.byCategory.map((c) => c.category).sort();
    const tonnesOf = (vm: typeof scope1) =>
      vm.current!.byCategory.reduce((sum, c) => sum + c.tonnes, 0);

    expect(namesOf(both)).toEqual([...namesOf(scope1), ...namesOf(scope3)].sort());
    expect(tonnesOf(both)).toBeCloseTo(tonnesOf(scope1) + tonnesOf(scope3), 6);
  });

  it("byElement for a 2-scope selection is the union of each scope's own elements, no dupes", async () => {
    const scope1 = await loadDashboard(COMPANY_ID, { scope: ["SCOPE_1"] });
    const scope3 = await loadDashboard(COMPANY_ID, { scope: ["SCOPE_3"] });
    const both = await loadDashboard(COMPANY_ID, { scope: ["SCOPE_1", "SCOPE_3"] });

    const namesOf = (vm: typeof scope1) => vm.current!.byElement.map((e) => e.element).sort();
    const tonnesOf = (vm: typeof scope1) =>
      vm.current!.byElement.reduce((sum, e) => sum + e.tonnes, 0);

    expect(namesOf(both)).toEqual([...namesOf(scope1), ...namesOf(scope3)].sort());
    expect(tonnesOf(both)).toBeCloseTo(tonnesOf(scope1) + tonnesOf(scope3), 6);
    // SCOPE_2's element must not leak into a filter that never checked SCOPE_2.
    expect(namesOf(both)).not.toContain(
      "SISTEMA INTERCONECTADO NACIONAL - SIN",
    );
  });

  it("drops an unknown or duplicated scope token rather than throwing or double-counting", async () => {
    const messy = await loadDashboard(COMPANY_ID, {
      // @ts-expect-error - deliberately malformed input, same as a tampered URL param would produce
      scope: ["SCOPE_1", "SCOPE_1", "not-a-scope"],
    });
    const clean = await loadDashboard(COMPANY_ID, { scope: ["SCOPE_1"] });

    expect(messy.filters.scope).toEqual(["SCOPE_1"]);
    expect(messy.current!.total).toBeCloseTo(clean.current!.total, 6);
  });
});

// The client reported on 2026-09-03 that the gas figures were wrong and asked for every gas to be
// shown separately, with fossil and non-fossil CH4 apart. The property that makes the chart
// trustworthy is not any individual number but the reconciliation: whatever the filter, the gas
// slices must sum to the very total the KPI card prints, and the columns must be a fixed set so a
// gas reading zero still appears instead of silently vanishing.
describe("loadDashboard: the gas breakdown", () => {
  it("always exposes the client's eight gases, in their order", async () => {
    const vm = await loadDashboard(COMPANY_ID, {});
    // Every fixture factor is pre-blended with no gasType captured, so this run also carries the
    // unidentified bucket - which belongs at the end, after the eight named gases.
    expect(vm.current!.byGas.slices.map((s) => s.gas)).toEqual([
      "CO2",
      "CH4_NON_FOSSIL",
      "CH4_FOSSIL",
      "N2O",
      "HFC",
      "PFC",
      "SF6",
      "NF3",
      "UNIDENTIFIED",
    ]);
  });

  it("keeps a named gas visible at zero rather than dropping the column", async () => {
    const vm = await loadDashboard(COMPANY_ID, {});
    const sf6 = vm.current!.byGas.slices.find((s) => s.gas === "SF6");
    expect(sf6).toEqual({ gas: "SF6", tonnes: 0, pct: 0 });
  });

  it("sums to the same total the KPI card shows, unfiltered and filtered alike", async () => {
    for (const filters of [{}, { scope: ["SCOPE_1" as const] }, { scope: ["SCOPE_1" as const, "SCOPE_3" as const] }]) {
      const vm = await loadDashboard(COMPANY_ID, filters);
      const summed = vm.current!.byGas.slices.reduce((sum, s) => sum + s.tonnes, 0);
      expect(summed).toBeCloseTo(vm.current!.total, 9);
    }
  });

  it("keeps the percentages on the same base as the total, so they add to 100", async () => {
    const vm = await loadDashboard(COMPANY_ID, {});
    const pct = vm.current!.byGas.slices.reduce((sum, s) => sum + s.pct, 0);
    expect(pct).toBeCloseTo(100, 6);
  });

  it("discloses the unidentified bucket rather than folding it into a named gas", async () => {
    // Every fixture entry is pre-blended with no gasType captured, so all of its tonnes are
    // genuinely unattributed. Hiding that would silently attribute them to a gas they may not be.
    const vm = await loadDashboard(COMPANY_ID, { scope: ["SCOPE_1"] });
    const unidentified = vm.current!.byGas.slices.find((s) => s.gas === "UNIDENTIFIED");
    expect(unidentified?.tonnes).toBeCloseTo(vm.current!.total, 9);
    expect(unidentified?.pct).toBeCloseTo(100, 6);
  });
});
