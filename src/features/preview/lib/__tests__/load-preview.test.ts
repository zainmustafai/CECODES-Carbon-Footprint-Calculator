import { describe, expect, it, vi } from "vitest";

// loadCompanyWidePreview unions every facility's entries for a year and prices them through
// rollupYear directly (see the function's own comment for why: shapeEntries/estimateSourceTonnes,
// the engine loadPreview's single-facility path uses, keys a Scope 2 source's cells by
// (emissionFactorId, month) - two facilities reporting the SAME month for the SAME element would
// collide into two cells claiming that month, and .find() would silently keep only one of them in
// the monthly display. rollupYear has no such issue, and this file's job is to prove the
// consolidated view actually reconciles across facilities instead of quietly dropping one.

const findManyFacility = vi.fn();
const findManyReportingYear = vi.fn();
const findManyActivityEntry = vi.fn();
const findUniqueGridFactor = vi.fn();
const findUniqueSubsidyPrice = vi.fn();
const findManyCleanTech = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    facility: { findMany: (...args: unknown[]) => findManyFacility(...args) },
    reportingYear: { findMany: (...args: unknown[]) => findManyReportingYear(...args) },
    activityEntry: { findMany: (...args: unknown[]) => findManyActivityEntry(...args) },
    gridElectricityFactor: { findUnique: (...args: unknown[]) => findUniqueGridFactor(...args) },
    transportSubsidyPrice: { findUnique: (...args: unknown[]) => findUniqueSubsidyPrice(...args) },
    cleanTechEntry: { findMany: (...args: unknown[]) => findManyCleanTech(...args) },
  },
}));

const { loadCompanyWidePreview } = await import("../load-preview");

const COMPANY_ID = "company-1";
const FACILITY_A = "facility-a";
const FACILITY_B = "facility-b";
const RY_A = "ry-a-2024";
const RY_B = "ry-b-2024";
const YEAR = 2024;

const DIESEL_FACTOR = {
  active: true,
  biogenic: false,
  co2Factor: null,
  ch4Factor: null,
  n2oFactor: null,
  co2eFactor: "10", // kg CO2e / gal, pre-blended so the math stays simple
  factorUnit: "kg CO2e/gal",
  entryMode: "QUANTITY" as const,
};

// Two facilities BOTH report January electricity - the exact shape that would collide inside
// shapeEntries' per-(emissionFactorId, month) cell keying.
const ENTRIES = [
  {
    reportingYearId: RY_A,
    scope: "SCOPE_1",
    category: "Fuentes Fijas",
    subcategory: "Combustibles Líquidos (fijos)",
    element: "Diesel",
    unit: "Gal",
    month: null,
    value: "100",
    secondaryValue: null,
    emissionFactor: DIESEL_FACTOR,
  },
  {
    reportingYearId: RY_B,
    scope: "SCOPE_1",
    category: "Fuentes Fijas",
    subcategory: "Combustibles Líquidos (fijos)",
    element: "Diesel",
    unit: "Gal",
    month: null,
    value: "50",
    secondaryValue: null,
    emissionFactor: DIESEL_FACTOR,
  },
  {
    reportingYearId: RY_A,
    scope: "SCOPE_2",
    category: "Consumo de energía eléctrica",
    subcategory: null,
    element: "Electricidad",
    unit: "kWh",
    month: 1,
    value: "100",
    secondaryValue: null,
    emissionFactor: null,
  },
  {
    reportingYearId: RY_B,
    scope: "SCOPE_2",
    category: "Consumo de energía eléctrica",
    subcategory: null,
    element: "Electricidad",
    unit: "kWh",
    month: 1,
    value: "50",
    secondaryValue: null,
    emissionFactor: null,
  },
];

function setup() {
  vi.clearAllMocks();
  findManyFacility.mockResolvedValue([
    { id: FACILITY_A, name: "Planta A" },
    { id: FACILITY_B, name: "Planta B" },
  ]);
  findManyReportingYear.mockResolvedValue([
    { id: RY_A, facilityId: FACILITY_A, year: YEAR, gwpSet: "AR6" },
    { id: RY_B, facilityId: FACILITY_B, year: YEAR, gwpSet: "AR6" },
  ]);
  findManyActivityEntry.mockResolvedValue(ENTRIES);
  findUniqueGridFactor.mockResolvedValue({ factor: "0.2" }); // kg CO2/kWh
  findUniqueSubsidyPrice.mockResolvedValue(null);
  findManyCleanTech.mockResolvedValue([]);
}

describe("loadCompanyWidePreview", () => {
  it("sums an annual (Scope 1) element's quantity and tonnes across every facility", async () => {
    setup();
    const vm = await loadCompanyWidePreview(COMPANY_ID, { year: YEAR });

    const scope1 = vm.scopes.find((s) => s.scope === "SCOPE_1")!;
    const diesel = scope1.categories.find((c) => c.category === "Fuentes Fijas")!.sources[0];

    expect(diesel.quantity).toBe(150); // 100 + 50, not just one facility's reading
    expect(diesel.hasQuantity).toBe(true);
    expect(diesel.estimate.kind).toBe("ok");
    if (diesel.estimate.kind === "ok") {
      // 150 gal * 10 kg CO2e/gal = 1500 kg = 1.5 t, computed by rollupYear from BOTH entries.
      expect(diesel.estimate.tonnes).toBeCloseTo(1.5, 6);
    }
  });

  it("sums Scope 2's SAME month across facilities instead of one overwriting the other", async () => {
    setup();
    const vm = await loadCompanyWidePreview(COMPANY_ID, { year: YEAR });

    const scope2 = vm.scopes.find((s) => s.scope === "SCOPE_2")!;
    const electricidad = scope2.categories[0].sources[0];

    // The bug this design avoids: shapeEntries' cell lookup would show only 100 or only 50 here.
    expect(electricidad.monthly[0]).toBe("150");
    expect(electricidad.monthly.slice(1).every((m) => m === "")).toBe(true);
    expect(electricidad.quantity).toBe(150);
    expect(electricidad.estimate.kind).toBe("ok");
    if (electricidad.estimate.kind === "ok") {
      // (100 + 50) kWh * 0.2 kg CO2/kWh = 30 kg = 0.03 t.
      expect(electricidad.estimate.tonnes).toBeCloseTo(0.03, 6);
    }
  });

  it("reconciles the headline total to the sum of both facilities' own totals", async () => {
    setup();
    const vm = await loadCompanyWidePreview(COMPANY_ID, { year: YEAR });

    expect(vm.totalTonnes).toBeCloseTo(1.53, 6); // 1.5 (Diesel) + 0.03 (Electricidad)
    expect(vm.bySede).toHaveLength(2);

    const bySedeSum = vm.bySede.reduce((sum, s) => sum + s.tonnes, 0);
    expect(bySedeSum).toBeCloseTo(vm.totalTonnes, 6);

    const plantaA = vm.bySede.find((s) => s.facilityId === FACILITY_A)!;
    const plantaB = vm.bySede.find((s) => s.facilityId === FACILITY_B)!;
    expect(plantaA.facilityName).toBe("Planta A");
    expect(plantaA.tonnes).toBeCloseTo(1.02, 6); // 1t Diesel + 0.02t electricidad
    expect(plantaB.tonnes).toBeCloseTo(0.51, 6); // 0.5t Diesel + 0.01t electricidad
  });

  it("reconciles every scope's tonnes to the headline total", async () => {
    setup();
    const vm = await loadCompanyWidePreview(COMPANY_ID, { year: YEAR });
    const sum = vm.scopes.reduce((s, scope) => s + scope.tonnes, 0);
    expect(sum).toBeCloseTo(vm.totalTonnes, 6);
  });

  it("carries the shared gwpSet and never returns bySede in single-facility mode", async () => {
    setup();
    const vm = await loadCompanyWidePreview(COMPANY_ID, { year: YEAR });
    expect(vm.gwpSet).toBe("AR6");
    expect(vm.filters.facilityId).toBeNull();
    expect(vm.selectedFacilityName).toBeNull();
  });

  it("falls back to the most recent year when the requested year has no data", async () => {
    setup();
    const vm = await loadCompanyWidePreview(COMPANY_ID, { year: 1999 });
    expect(vm.filters.year).toBe(YEAR);
  });

  it("reports noYear when the company has no reporting years at all", async () => {
    setup();
    findManyReportingYear.mockResolvedValue([]);
    const vm = await loadCompanyWidePreview(COMPANY_ID, { year: null });
    expect(vm.isEmpty).toBe(true);
    expect(vm.emptyReason).toBe("noYear");
  });

  it("reports noData when the year has reporting years but nothing was entered", async () => {
    setup();
    findManyActivityEntry.mockResolvedValue([]);
    const vm = await loadCompanyWidePreview(COMPANY_ID, { year: YEAR });
    expect(vm.isEmpty).toBe(true);
    expect(vm.emptyReason).toBe("noData");
  });
});
