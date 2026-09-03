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
const findManySubsidyPrice = vi.fn();
const findManyCleanTech = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    facility: { findMany: (...args: unknown[]) => findManyFacility(...args) },
    reportingYear: { findMany: (...args: unknown[]) => findManyReportingYear(...args) },
    activityEntry: { findMany: (...args: unknown[]) => findManyActivityEntry(...args) },
    gridElectricityFactor: { findUnique: (...args: unknown[]) => findUniqueGridFactor(...args) },
    // One row per fuel per year since 2026-09-03, so the loader reads them all rather than
    // looking one up by year.
    transportSubsidyPrice: { findMany: (...args: unknown[]) => findManySubsidyPrice(...args) },
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
    trips: [],
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
    trips: [],
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
    trips: [],
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
    trips: [],
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
  findManySubsidyPrice.mockResolvedValue([]);
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

// Regression coverage for the 2026-08-15 audit finding: MONEY_PER_GALLON and
// COUNT_TIMES_DISTANCE entries showed the raw stored number next to the factor's own unit (a
// COP amount labeled "gal"; a passenger/vehicle count labeled "pasajeros * km" with the distance
// silently dropped). The fix only relabels what's displayed - it must NOT change what rollupYear
// computes, so every test here asserts both the label AND the (unchanged) tonnes together.
describe("loadCompanyWidePreview - entry-mode display (money-per-gallon, count-times-distance)", () => {
  const MONEY_FACTOR = {
    active: true,
    biogenic: false,
    co2Factor: "7.6181",
    ch4Factor: null,
    n2oFactor: null,
    co2eFactor: null,
    factorUnit: "kg CO2/gal",
    entryMode: "MONEY_PER_GALLON" as const,
    fuelType: "GASOLINE" as const,
  };
  // The other half of the C6 subsidy pair. Its own price is far below gasoline's, so a run that
  // divided by the wrong one is impossible to mistake for a rounding difference.
  const DIESEL_MONEY_FACTOR = {
    ...MONEY_FACTOR,
    co2Factor: "10.2765",
    fuelType: "DIESEL" as const,
  };
  const DISTANCE_FACTOR = {
    active: true,
    biogenic: false,
    co2Factor: null,
    ch4Factor: null,
    n2oFactor: null,
    co2eFactor: "0.1013051585",
    factorUnit: "kg CO2e/pasajeros*km",
    entryMode: "COUNT_TIMES_DISTANCE" as const,
  };

  // The year's prices arrive as one row per fuel, exactly as the table now stores them: a test
  // that passed a single number could no longer say which fuel it meant.
  function setupEntryMode(
    entries: unknown[],
    subsidyPrices: { fuel: "GASOLINE" | "DIESEL"; pricePerGallonCop: string }[],
  ) {
    vi.clearAllMocks();
    findManyFacility.mockResolvedValue([{ id: FACILITY_A, name: "Planta A" }]);
    findManyReportingYear.mockResolvedValue([
      { id: RY_A, facilityId: FACILITY_A, year: YEAR, gwpSet: "AR6" },
    ]);
    findManyActivityEntry.mockResolvedValue(entries);
    findUniqueGridFactor.mockResolvedValue(null);
    findManySubsidyPrice.mockResolvedValue(subsidyPrices);
    findManyCleanTech.mockResolvedValue([]);
  }

  it("labels a MONEY_PER_GALLON entry's quantity as COP, not the factor's gal unit, and still derives the correct tonnes", async () => {
    setupEntryMode(
      [
        {
          reportingYearId: RY_A,
          scope: "SCOPE_3",
          category: "C6: Viajes de negocios",
          subcategory: "Subsidios de transporte",
          element: "C6: Gasolina E10",
          unit: "gal",
          month: null,
          value: "13800", // COP, not gallons
          secondaryValue: null,
          trips: [],
          emissionFactor: MONEY_FACTOR,
        },
      ],
      [{ fuel: "GASOLINE", pricePerGallonCop: "13800" }], // COP/gal -> 1 gallon derived
    );
    const vm = await loadCompanyWidePreview(COMPANY_ID, { year: YEAR });
    const source = vm.scopes.find((s) => s.scope === "SCOPE_3")!.categories[0].sources[0];

    expect(source.unit).toBe("COP"); // not "gal"
    expect(source.quantity).toBe(13800); // the entered COP amount, unrelabeled
    expect(source.secondaryQuantity).toBeNull();
    expect(source.estimate.kind).toBe("ok");
    if (source.estimate.kind === "ok") {
      // 13800 COP / 13800 COP-per-gal = 1 gal; 1 gal * 7.6181 kg CO2/gal = 7.6181 kg = 0.0076181 t.
      expect(source.estimate.tonnes).toBeCloseTo(0.0076181, 7);
    }
  });

  it("shows both the count and the distance for a COUNT_TIMES_DISTANCE entry, and still derives count*distance for tonnes", async () => {
    setupEntryMode(
      [
        {
          reportingYearId: RY_A,
          scope: "SCOPE_3",
          category: "C6: Viajes de negocios",
          subcategory: "Viajes Aéreos",
          element: "C6: Viajes aéreos - Recorridos largos",
          unit: "pasajeros * km",
          month: null,
          value: "5600", // passengers, not the full activity quantity
          secondaryValue: "1", // km
          trips: [],
          emissionFactor: DISTANCE_FACTOR,
        },
      ],
      [],
    );
    const vm = await loadCompanyWidePreview(COMPANY_ID, { year: YEAR });
    const source = vm.scopes.find((s) => s.scope === "SCOPE_3")!.categories[0].sources[0];

    expect(source.unit).toBe("pasajeros");
    expect(source.quantity).toBe(5600); // the count, not silently dropped
    expect(source.secondaryQuantity).toBe(1); // the distance, no longer dropped
    expect(source.secondaryUnit).toBe("km");
    expect(source.estimate.kind).toBe("ok");
    if (source.estimate.kind === "ok") {
      // 5600 * 1 = 5600 pasajeros*km; 5600 * 0.1013051585 kg CO2e = 567.30889 kg = 0.56730889 t.
      expect(source.estimate.tonnes).toBeCloseTo(0.56730889, 6);
    }
  });

  it("never sets secondaryQuantity for an ordinary QUANTITY entry", async () => {
    setupEntryMode(
      [
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
          trips: [],
          emissionFactor: {
            active: true,
            biogenic: false,
            co2Factor: null,
            ch4Factor: null,
            n2oFactor: null,
            co2eFactor: "10",
            factorUnit: "kg CO2e/gal",
            entryMode: "QUANTITY" as const,
          },
        },
      ],
      [],
    );
    const vm = await loadCompanyWidePreview(COMPANY_ID, { year: YEAR });
    const source = vm.scopes.find((s) => s.scope === "SCOPE_1")!.categories[0].sources[0];

    expect(source.unit).toBe("Gal");
    expect(source.secondaryQuantity).toBeNull();
    expect(source.secondaryUnit).toBeNull();
  });

  // Until 2026-09-03 the year held ONE price and both C6 subsidy factors divided by it, so diesel
  // was charged the gasoline price and reported roughly 40% of its real emissions. The two prices
  // below are the client's own national averages, and the assertion is deliberately two-sided:
  // reading the right number is only half of it, reading the other fuel's must fail.
  it("divides a DIESEL subsidy by the diesel price while the gasoline price is also loaded", async () => {
    setupEntryMode(
      [
        {
          reportingYearId: RY_A,
          scope: "SCOPE_3",
          category: "C6: Viajes de negocios",
          subcategory: "Subsidios de transporte",
          element: "C6: Diésel B10 (Mezcla comercial) - Móvil",
          unit: "gal",
          month: null,
          value: "1000000", // COP
          secondaryValue: null,
          trips: [],
          emissionFactor: DIESEL_MONEY_FACTOR,
        },
      ],
      [
        { fuel: "GASOLINE", pricePerGallonCop: "16046.315789" },
        { fuel: "DIESEL", pricePerGallonCop: "9574.157895" },
      ],
    );
    const vm = await loadCompanyWidePreview(COMPANY_ID, { year: YEAR });
    const source = vm.scopes.find((s) => s.scope === "SCOPE_3")!.categories[0].sources[0];

    expect(vm.missingTransportSubsidyPrice).toBe(false);
    expect(source.estimate.kind).toBe("ok");
    if (source.estimate.kind !== "ok") return;
    // 1.000.000 COP / 9.574,157895 COP-per-gal = 104,4477 gal; x 10,2765 kg CO2/gal = 1,0733 t.
    expect(source.estimate.tonnes).toBeCloseTo((1000000 / 9574.157895) * 10.2765 * 0.001, 9);
    expect(source.estimate.tonnes).not.toBeCloseTo(
      (1000000 / 16046.315789) * 10.2765 * 0.001,
      6,
    );
  });
});
