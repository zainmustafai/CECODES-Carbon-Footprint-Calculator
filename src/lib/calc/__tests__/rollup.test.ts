import { describe, expect, it } from "vitest";
import type { FuelType } from "@/lib/calc/fuel";
import { OTHER_GAS_FALLBACK, rollupYear, type RollupEntry, type RollupFactor } from "@/lib/calc/rollup";

const consolidated = (
  co2e: string,
  biogenic = false,
  gasType: string | null = null,
): RollupFactor => ({
  co2Factor: null,
  ch4Factor: null,
  n2oFactor: null,
  co2eFactor: co2e,
  biogenic,
  entryMode: "QUANTITY",
  gasType,
});

const perGas = (
  co2: string | null,
  ch4: string | null,
  n2o: string | null,
  biogenic = false,
): RollupFactor => ({
  co2Factor: co2,
  ch4Factor: ch4,
  n2oFactor: n2o,
  co2eFactor: null,
  biogenic,
  entryMode: "QUANTITY",
});

describe("rollupYear: the Requirements worked examples", () => {
  it("refrigerant leak: 10 kg of R-22 at 1960 kg CO2e/kg is 19.6 t (Scope 1)", () => {
    const r = rollupYear({
      entries: [
        { scope: "SCOPE_1", category: "Emisiones Fugitivas", subcategory: null, element: "Emisiones Fugitivas", month: null, value: "10", secondaryValue: null, factor: consolidated("1960") },
      ],
      gridFactor: null, fuelPrices: null,
      gwpSet: "AR6",
    });
    expect(r.byScope.SCOPE_1).toBeCloseTo(19.6, 6);
    expect(r.totalTonnes).toBeCloseTo(19.6, 6);
  });

  it("electricity: 500000 kWh in 2024 at 0.217 is 108.5 t (Scope 2)", () => {
    const r = rollupYear({
      entries: [
        { scope: "SCOPE_2", category: "Consumo de energía eléctrica", subcategory: null, element: "Consumo de energía eléctrica", month: 1, value: "500000", secondaryValue: null, factor: null },
      ],
      gridFactor: "0.217", fuelPrices: null,
      gwpSet: "AR6",
    });
    expect(r.byScope.SCOPE_2).toBeCloseTo(108.5, 6);
    expect(r.scope2Monthly[0].tonnes).toBeCloseTo(108.5, 6);
  });
});

describe("rollupYear: per-gas combustion", () => {
  it("computes CO2 + CH4*GWP + N2O*GWP for AR6 diesel", () => {
    // 14957.10 gal, co2 10.149, ch4 0.00001, n2o 0.000006 (AR6: 1, 29.8, 273).
    // co2  = 14957.10 * 10.149        = 151799.6079
    // ch4  = 14957.10 * 0.00001 * 29.8 =      4.4572158
    // n2o  = 14957.10 * 0.000006 * 273 =     24.4997298
    // total = 151828.5648 kg = 151.8285648 t
    const r = rollupYear({
      entries: [
        {
          scope: "SCOPE_1",
          category: "Fuentes Fijas",
          subcategory: null,
          element: "Fuentes Fijas",
          month: null,
          value: "14957.10", secondaryValue: null,
          factor: perGas("10.149", "0.00001", "0.000006"),
        },
      ],
      gridFactor: null, fuelPrices: null,
      gwpSet: "AR6",
    });
    expect(r.byScope.SCOPE_1).toBeCloseTo(151.8285648, 6);
  });
});

describe("rollupYear: aggregation", () => {
  const entries: RollupEntry[] = [
    { scope: "SCOPE_1", category: "Fuentes Fijas", subcategory: null, element: "Fuentes Fijas", month: null, value: "10", secondaryValue: null, factor: consolidated("100") }, // 1 t
    { scope: "SCOPE_1", category: "Fuentes Fijas", subcategory: null, element: "Fuentes Fijas", month: null, value: "5", secondaryValue: null, factor: consolidated("100") }, // 0.5 t
    { scope: "SCOPE_1", category: "Emisiones Fugitivas", subcategory: null, element: "Emisiones Fugitivas", month: null, value: "2", secondaryValue: null, factor: consolidated("1000") }, // 2 t
    { scope: "SCOPE_3", category: "Residuos", subcategory: null, element: "Residuos", month: null, value: "10", secondaryValue: null, factor: consolidated("500") }, // 5 t
    { scope: "SCOPE_2", category: "Consumo de energía eléctrica", subcategory: null, element: "Consumo de energía eléctrica", month: 1, value: "1000", secondaryValue: null, factor: null }, // 0.5 t
    { scope: "SCOPE_2", category: "Consumo de energía eléctrica", subcategory: null, element: "Consumo de energía eléctrica", month: 2, value: "2000", secondaryValue: null, factor: null }, // 1 t
  ];

  it("sums per scope and overall", () => {
    const r = rollupYear({ entries, gridFactor: "0.5", fuelPrices: null, gwpSet: "AR6" });
    expect(r.byScope.SCOPE_1).toBeCloseTo(3.5, 6);
    expect(r.byScope.SCOPE_2).toBeCloseTo(1.5, 6);
    expect(r.byScope.SCOPE_3).toBeCloseTo(5, 6);
    expect(r.totalTonnes).toBeCloseTo(10, 6);
  });

  it("groups by category, largest first, merging same-category rows", () => {
    const r = rollupYear({ entries, gridFactor: "0.5", fuelPrices: null, gwpSet: "AR6" });
    expect(r.byCategory[0]).toMatchObject({ category: "Residuos", tonnes: 5 });
    const fijas = r.byCategory.find((c) => c.category === "Fuentes Fijas");
    expect(fijas?.tonnes).toBeCloseTo(1.5, 6); // 10 and 5 merged
  });

  it("places Scope 2 tonnes in the right months and leaves the rest as gaps", () => {
    const r = rollupYear({ entries, gridFactor: "0.5", fuelPrices: null, gwpSet: "AR6" });
    expect(r.scope2Monthly[0].tonnes).toBeCloseTo(0.5, 6);
    expect(r.scope2Monthly[1].tonnes).toBeCloseTo(1, 6);
    // Months 3..12 were never reported: null, not 0.
    expect(r.scope2Monthly[2].tonnes).toBeNull();
    expect(r.scope2Monthly[11].tonnes).toBeNull();
  });
});

// The dashboard's "emissions by gas" card reads co2Tonnes/ch4Tonnes/n2oTonnes/otherGasesTonnes
// directly off CategoryTotal. These must reconcile to `tonnes` for every category (by
// construction, per rollup.ts's own comment) and therefore to totalTonnes when summed - that
// reconciliation is the actual correctness bar this feature has to clear, not just "it renders".
describe("rollupYear: the gas breakdown reconciles with the totals it sits beside", () => {
  it("a pure-CO2 category (Scope 2, grid electricity) puts everything in co2Tonnes", () => {
    const r = rollupYear({
      entries: [
        { scope: "SCOPE_2", category: "Consumo de energía eléctrica", subcategory: null, element: "Electricidad", month: 1, value: "1000", secondaryValue: null, factor: null },
      ],
      gridFactor: "0.217", fuelPrices: null,
      gwpSet: "AR6",
    });
    const category = r.byCategory[0];
    expect(category.co2Tonnes).toBeCloseTo(category.tonnes, 9);
    expect(category.ch4Tonnes).toBe(0);
    expect(category.n2oTonnes).toBe(0);
    expect(category.otherGasesTonnes).toBe(0);
  });

  it("a consolidated (pre-blended) category puts everything in otherGasesTonnes", () => {
    const r = rollupYear({
      entries: [
        { scope: "SCOPE_1", category: "Emisiones Fugitivas", subcategory: null, element: "R-22", month: null, value: "10", secondaryValue: null, factor: consolidated("1960") },
      ],
      gridFactor: null, fuelPrices: null,
      gwpSet: "AR6",
    });
    const category = r.byCategory[0];
    expect(category.otherGasesTonnes).toBeCloseTo(category.tonnes, 9);
    expect(category.co2Tonnes).toBe(0);
    expect(category.ch4Tonnes).toBe(0);
    expect(category.n2oTonnes).toBe(0);
    expect(category.otherGasesEntries).toBe(1);
    expect(category.gasResolvedEntries).toBe(0);
    // No gasType was captured for this factor, so it falls into the documented fallback bucket.
    expect(category.otherGasesByType).toEqual({ [OTHER_GAS_FALLBACK]: category.otherGasesTonnes });
  });

  it("for every category, the four gas fields sum to tonnes exactly", () => {
    const entries: RollupEntry[] = [
      { scope: "SCOPE_1", category: "Fuentes Fijas", subcategory: null, element: "Diesel", month: null, value: "14957.10", secondaryValue: null, factor: perGas("10.149", "0.00001", "0.000006") },
      { scope: "SCOPE_1", category: "Emisiones Fugitivas", subcategory: null, element: "R-22", month: null, value: "10", secondaryValue: null, factor: consolidated("1960") },
      { scope: "SCOPE_3", category: "Residuos", subcategory: null, element: "Residuos", month: null, value: "10", secondaryValue: null, factor: consolidated("500") },
      { scope: "SCOPE_2", category: "Consumo de energía eléctrica", subcategory: null, element: "Electricidad", month: 1, value: "1000", secondaryValue: null, factor: null },
    ];
    const r = rollupYear({ entries, gridFactor: "0.217", fuelPrices: null, gwpSet: "AR6" });

    for (const category of r.byCategory) {
      const sum =
        category.co2Tonnes + category.ch4Tonnes + category.n2oTonnes + category.otherGasesTonnes;
      expect(sum).toBeCloseTo(category.tonnes, 9);
    }

    // And summing every category's gas fields reconciles to the grand total, the number the
    // dashboard's KPI card already shows.
    const totalCo2 = r.byCategory.reduce((s, c) => s + c.co2Tonnes, 0);
    const totalOther = r.byCategory.reduce((s, c) => s + c.otherGasesTonnes, 0);
    const totalCh4 = r.byCategory.reduce((s, c) => s + c.ch4Tonnes, 0);
    const totalN2o = r.byCategory.reduce((s, c) => s + c.n2oTonnes, 0);
    expect(totalCo2 + totalCh4 + totalN2o + totalOther).toBeCloseTo(r.totalTonnes, 9);
  });

  it("mixed gas-resolved and pre-blended entries in the SAME category still reconcile", () => {
    const r = rollupYear({
      entries: [
        { scope: "SCOPE_1", category: "Emisiones Fugitivas", subcategory: null, element: "Fuga de proceso", month: null, value: "100", secondaryValue: null, factor: perGas("1", "0.2", "0.05") },
        { scope: "SCOPE_1", category: "Emisiones Fugitivas", subcategory: null, element: "R-22", month: null, value: "10", secondaryValue: null, factor: consolidated("1960") },
      ],
      gridFactor: null, fuelPrices: null,
      gwpSet: "AR6",
    });
    const category = r.byCategory[0];
    expect(category.gasResolvedEntries).toBe(1);
    expect(category.otherGasesEntries).toBe(1);
    expect(category.co2Tonnes + category.ch4Tonnes + category.n2oTonnes + category.otherGasesTonnes).toBeCloseTo(
      category.tonnes,
      9,
    );
    // Both the gas-resolved row's CO2 and the pre-blended row's total must have landed.
    expect(category.co2Tonnes).toBeGreaterThan(0);
    expect(category.otherGasesTonnes).toBeCloseTo(19.6, 6);
  });
});

// Client feedback 2026-08-15: "For the 'emisiones por gases' chart, please include all of the
// gases separately when reported... specify those 'other' such SF6, NF3, etc." map-row.ts
// captures which sheet column a pre-blended factor's value came from as RollupFactor.gasType;
// these tests pin how rollupYear buckets it, and that the bucketing never breaks the
// otherGasesTonnes reconciliation the previous describe block already established.
describe("rollupYear: the named gas-type breakdown (otherGasesByType)", () => {
  it("buckets a pre-blended entry with a captured gasType by that name, not the fallback", () => {
    const r = rollupYear({
      entries: [
        { scope: "SCOPE_1", category: "Emisiones Fugitivas", subcategory: null, element: "SF6 puro", month: null, value: "1", secondaryValue: null, factor: consolidated("22800", false, "SF6") },
      ],
      gridFactor: null, fuelPrices: null,
      gwpSet: "AR6",
    });
    const category = r.byCategory[0];
    expect(category.otherGasesByType).toEqual({ SF6: category.otherGasesTonnes });
    expect(category.otherGasesByType[OTHER_GAS_FALLBACK]).toBeUndefined();
  });

  it("falls back to the documented bucket for a pre-blended entry with no captured gasType", () => {
    const r = rollupYear({
      entries: [
        { scope: "SCOPE_1", category: "Emisiones Fugitivas", subcategory: null, element: "R-22 (importado antes del backfill)", month: null, value: "10", secondaryValue: null, factor: consolidated("1960") },
      ],
      gridFactor: null, fuelPrices: null,
      gwpSet: "AR6",
    });
    const category = r.byCategory[0];
    expect(Object.keys(category.otherGasesByType)).toEqual([OTHER_GAS_FALLBACK]);
    expect(category.otherGasesByType[OTHER_GAS_FALLBACK]).toBeCloseTo(category.otherGasesTonnes, 9);
  });

  it("sums otherGasesByType back to otherGasesTonnes exactly when several gas types share a category", () => {
    const entries: RollupEntry[] = [
      { scope: "SCOPE_1", category: "Emisiones Fugitivas", subcategory: null, element: "HFC-134a", month: null, value: "10", secondaryValue: null, factor: consolidated("1300", false, "HFC") },
      { scope: "SCOPE_1", category: "Emisiones Fugitivas", subcategory: null, element: "SF6 puro", month: null, value: "1", secondaryValue: null, factor: consolidated("22800", false, "SF6") },
      { scope: "SCOPE_1", category: "Emisiones Fugitivas", subcategory: null, element: "HFC-32", month: null, value: "5", secondaryValue: null, factor: consolidated("677", false, "HFC") }, // same gasType, merges with the HFC-134a row
      { scope: "SCOPE_1", category: "Emisiones Fugitivas", subcategory: null, element: "R-22 legacy", month: null, value: "10", secondaryValue: null, factor: consolidated("1960") }, // no gasType
    ];
    const r = rollupYear({ entries, gridFactor: null, fuelPrices: null, gwpSet: "AR6" });
    const category = r.byCategory[0];

    const sum = Object.values(category.otherGasesByType).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(category.otherGasesTonnes, 9);
    expect(Object.keys(category.otherGasesByType).sort()).toEqual(["HFC", OTHER_GAS_FALLBACK, "SF6"].sort());
    // The two HFC rows (10 * 1.3 + 5 * 0.677 = 16.385 t) merged into one bucket.
    expect(category.otherGasesByType.HFC).toBeCloseTo(16.385, 6);
  });

  it("still reconciles co2/ch4/n2o/other to tonnes when a gasType is present (the invariant from the describe block above)", () => {
    const r = rollupYear({
      entries: [
        { scope: "SCOPE_1", category: "Fuentes Fijas", subcategory: null, element: "Diesel", month: null, value: "14957.10", secondaryValue: null, factor: perGas("10.149", "0.00001", "0.000006") },
        { scope: "SCOPE_1", category: "Emisiones Fugitivas", subcategory: null, element: "SF6 puro", month: null, value: "1", secondaryValue: null, factor: consolidated("22800", false, "SF6") },
      ],
      gridFactor: null, fuelPrices: null,
      gwpSet: "AR6",
    });
    for (const category of r.byCategory) {
      const sum =
        category.co2Tonnes + category.ch4Tonnes + category.n2oTonnes + category.otherGasesTonnes;
      expect(sum).toBeCloseTo(category.tonnes, 9);
    }
  });
});

// Requirements 7.4: element -> subcategory -> category -> scope -> company. The roll-up used to
// stop at category, so any drill-down or export had to re-group the raw entries itself, i.e. build
// a second engine. These levels exist so there is only ever one.
describe("rollupYear: the full 7.4 hierarchy", () => {
  const hierarchy: RollupEntry[] = [
    // Two elements under one subcategory.
    { scope: "SCOPE_1", category: "Fuentes Fijas", subcategory: "Combustibles Líquidos (fijos)", element: "Diesel", month: null, value: "10", secondaryValue: null, factor: consolidated("100") }, // 1 t
    { scope: "SCOPE_1", category: "Fuentes Fijas", subcategory: "Combustibles Líquidos (fijos)", element: "Fuel Oil", month: null, value: "20", secondaryValue: null, factor: consolidated("100") }, // 2 t
    // A second subcategory in the same category.
    { scope: "SCOPE_1", category: "Fuentes Fijas", subcategory: "Combustibles Gaseosos", element: "Gas Natural", month: null, value: "30", secondaryValue: null, factor: consolidated("100") }, // 3 t
    // A category with no subcategory: null is normal, not an error.
    { scope: "SCOPE_3", category: "Residuos", subcategory: null, element: "Residuos ordinarios", month: null, value: "40", secondaryValue: null, factor: consolidated("100") }, // 4 t
  ];

  it("totals each element, largest first", () => {
    const r = rollupYear({ entries: hierarchy, gridFactor: null, fuelPrices: null, gwpSet: "AR6" });

    expect(r.byElement).toHaveLength(4);
    expect(r.byElement[0].element).toBe("Residuos ordinarios"); // 4 t
    const diesel = r.byElement.find((e) => e.element === "Diesel");
    expect(diesel).toMatchObject({
      scope: "SCOPE_1",
      category: "Fuentes Fijas",
      subcategory: "Combustibles Líquidos (fijos)",
    });
    expect(diesel?.tonnes).toBeCloseTo(1, 6);
  });

  it("totals each subcategory, keeping a null subcategory as its own row", () => {
    const r = rollupYear({ entries: hierarchy, gridFactor: null, fuelPrices: null, gwpSet: "AR6" });

    const liquidos = r.bySubcategory.find(
      (s) => s.subcategory === "Combustibles Líquidos (fijos)",
    );
    expect(liquidos?.tonnes).toBeCloseTo(3, 6); // Diesel 1 + Fuel Oil 2

    const residuos = r.bySubcategory.find((s) => s.category === "Residuos");
    expect(residuos?.subcategory).toBeNull();
    expect(residuos?.tonnes).toBeCloseTo(4, 6);
  });

  it("collapses a Scope 2 element's twelve months into ONE element row", () => {
    const monthly: RollupEntry[] = Array.from({ length: 12 }, (_, i) => ({
      scope: "SCOPE_2" as const,
      category: "Consumo de energía eléctrica",
      subcategory: null,
      element: "Electricidad (Red Nacional - SIN)",
      month: i + 1,
      value: "1000", secondaryValue: null,
      factor: null,
    }));

    const r = rollupYear({ entries: monthly, gridFactor: "0.5", fuelPrices: null, gwpSet: "AR6" });

    expect(r.byElement).toHaveLength(1);
    expect(r.byElement[0].tonnes).toBeCloseTo(6, 6); // 12 x 1000 x 0.5 kg = 6 t
  });

  it("RECONCILES: each level sums to its parent, which is what makes a drill-down trustworthy", () => {
    const r = rollupYear({ entries: hierarchy, gridFactor: null, fuelPrices: null, gwpSet: "AR6" });
    const sum = (rows: { tonnes: number }[]) => rows.reduce((t, row) => t + row.tonnes, 0);

    // If these ever disagree, a user drilling into a number would watch it change, which destroys
    // trust in every number on the screen, not just the one they clicked.
    expect(sum(r.byElement)).toBeCloseTo(sum(r.bySubcategory), 6);
    expect(sum(r.bySubcategory)).toBeCloseTo(sum(r.byCategory), 6);
    expect(sum(r.byCategory)).toBeCloseTo(r.totalTonnes, 6);
    expect(r.totalTonnes).toBeCloseTo(10, 6);

    const fijas = r.byCategory.find((c) => c.category === "Fuentes Fijas")!;
    const fijasElements = r.byElement.filter((e) => e.category === "Fuentes Fijas");
    expect(sum(fijasElements)).toBeCloseTo(fijas.tonnes, 6);
  });

  it("excludes an unpriced element from EVERY level, not just the total", () => {
    const r = rollupYear({
      entries: [
        ...hierarchy,
        { scope: "SCOPE_1", category: "Fuentes Fijas", subcategory: "Combustibles Gaseosos", element: "Gas sin factor", month: null, value: "999", secondaryValue: null, factor: null },
      ],
      gridFactor: null, fuelPrices: null,
      gwpSet: "AR6",
    });

    expect(r.byElement.find((e) => e.element === "Gas sin factor")).toBeUndefined();
    expect(r.unpricedCount).toBe(1);
    expect(r.totalTonnes).toBeCloseTo(10, 6); // unchanged
  });
});

describe("rollupYear: honest edge cases", () => {
  it("EXCLUDES a Scope 2 entry with no grid factor rather than publishing a fabricated zero", () => {
    const r = rollupYear({
      entries: [
        { scope: "SCOPE_2", category: "Consumo de energía eléctrica", subcategory: null, element: "Consumo de energía eléctrica", month: 1, value: "500000", secondaryValue: null, factor: null },
      ],
      gridFactor: null, fuelPrices: null,
      gwpSet: "AR6",
    });

    expect(r.missingGridFactor).toBe(true);
    expect(r.byScope.SCOPE_2).toBe(0);

    // The regression that mattered. This entry used to fall through and add a REAL 0 t, which
    // created a category row worth 0 and marked January as "reported". A consumer that forgot to
    // check missingGridFactor (an export, a snapshot writer) would then publish that zero as if
    // it were a measurement. 500 MWh of electricity is not zero emissions; it is an unknown.
    expect(r.byCategory).toEqual([]);
    expect(r.scope2Monthly[0].tonnes).toBeNull();
    expect(r.unpricedCount).toBe(1);
  });

  it("EXCLUDES a factor the engine cannot read, such as a spend-only COP/USD row", () => {
    // An admin can fill only co2eFactorCop / co2eFactorUsd. FactorInput cannot see those columns,
    // so computeCo2eKg would return 0 and the source would land in the totals as 0 t with the
    // category looking complete. It must be excluded and counted instead.
    const spendOnly = {
      co2Factor: null,
      ch4Factor: null,
      n2oFactor: null,
      co2eFactor: null,
      biogenic: false,
      entryMode: "QUANTITY" as const,
    };

    const r = rollupYear({
      entries: [
        { scope: "SCOPE_3", category: "C1: Bienes y servicios adquiridos", subcategory: null, element: "C1: Bienes y servicios adquiridos", month: null, value: "1000000", secondaryValue: null, factor: spendOnly },
      ],
      gridFactor: null, fuelPrices: null,
      gwpSet: "AR6",
    });

    expect(r.totalTonnes).toBe(0);
    expect(r.byCategory).toEqual([]);
    expect(r.unpricedCount).toBe(1);
  });

  it("counts every unpriced entry, so a total can say it is incomplete", () => {
    const r = rollupYear({
      entries: [
        { scope: "SCOPE_2", category: "Consumo de energía eléctrica", subcategory: null, element: "Consumo de energía eléctrica", month: 1, value: "100", secondaryValue: null, factor: null },
        { scope: "SCOPE_1", category: "Fuentes Fijas", subcategory: null, element: "Fuentes Fijas", month: null, value: "100", secondaryValue: null, factor: null },
        { scope: "SCOPE_1", category: "Fuentes Fijas", subcategory: null, element: "Fuentes Fijas", month: null, value: "100", secondaryValue: null, factor: consolidated("10") },
      ],
      gridFactor: null, fuelPrices: null,
      gwpSet: "AR6",
    });

    expect(r.unpricedCount).toBe(2); // the Scope 2 row and the factorless Scope 1 row
    expect(r.totalTonnes).toBeCloseTo(1, 6); // only the one priceable row
  });

  it("tracks biogenic tonnes as a memo without excluding them from the total", () => {
    const r = rollupYear({
      entries: [
        { scope: "SCOPE_3", category: "Residuos", subcategory: null, element: "Residuos", month: null, value: "100", secondaryValue: null, factor: consolidated("10", true) }, // 1 t, biogenic
        { scope: "SCOPE_1", category: "Fuentes Fijas", subcategory: null, element: "Fuentes Fijas", month: null, value: "100", secondaryValue: null, factor: consolidated("10") }, // 1 t, fossil
      ],
      gridFactor: null, fuelPrices: null,
      gwpSet: "AR6",
    });
    expect(r.totalTonnes).toBeCloseTo(2, 6);
    expect(r.biogenicTonnes).toBeCloseTo(1, 6);
  });

  it("separates biogenic CO2 from the biogenic source's CH4 and N2O", () => {
    // 100 t of bagazo: co2 1664.92, ch4 0.001, n2o 0.0001, biogenic.
    //   co2 = 100 * 1664.92          = 166492 kg   <- the ONLY part that is biogenic CO2
    //   ch4 = 100 * 0.001  * 27      =      2.7 kg  (non-fossil GWP)
    //   n2o = 100 * 0.0001 * 273     =      2.73 kg
    // The whole source is 166.49743 t CO2e, but only 166.492 t of that is biogenic CO2.
    const r = rollupYear({
      entries: [
        {
          scope: "SCOPE_1",
          category: "Fuentes Fijas",
          subcategory: null,
          element: "Fuentes Fijas",
          month: null,
          value: "100", secondaryValue: null,
          factor: perGas("1664.92", "0.001", "0.0001", true),
        },
      ],
      gridFactor: null, fuelPrices: null,
      gwpSet: "AR6",
    });

    expect(r.biogenicTonnes).toBeCloseTo(166.49743, 6); // whole source, CH4 and N2O included
    expect(r.biogenicCo2Tonnes).toBeCloseTo(166.492, 6); // the CO2 term alone

    // The distinction is not academic. If CECODES rules that biogenic CO2 sits outside the
    // headline (Requirements 12.A5), subtracting biogenicTonnes would ALSO delete the 5.43 kg of
    // CH4 and N2O, which stay in Scope 1 under every reading of the GHG Protocol.
    expect(r.biogenicTonnes).toBeGreaterThan(r.biogenicCo2Tonnes);
    expect(r.biogenicCo2Partial).toBe(false);
  });

  it("admits when a biogenic CO2 memo is understated because the factor is consolidated", () => {
    // A consolidated CO2e factor cannot be split back into its gases, so the CO2-only memo
    // cannot be computed. Saying so beats inventing a decomposition.
    const r = rollupYear({
      entries: [
        { scope: "SCOPE_3", category: "Residuos", subcategory: null, element: "Residuos", month: null, value: "100", secondaryValue: null, factor: consolidated("10", true) },
      ],
      gridFactor: null, fuelPrices: null,
      gwpSet: "AR6",
    });

    expect(r.biogenicTonnes).toBeCloseTo(1, 6);
    expect(r.biogenicCo2Tonnes).toBe(0);
    expect(r.biogenicCo2Partial).toBe(true);
  });

  it("skips a Scope 1 row whose factor was removed rather than counting zero", () => {
    const r = rollupYear({
      entries: [
        { scope: "SCOPE_1", category: "Fuentes Fijas", subcategory: null, element: "Fuentes Fijas", month: null, value: "100", secondaryValue: null, factor: null },
      ],
      gridFactor: null, fuelPrices: null,
      gwpSet: "AR6",
    });
    expect(r.totalTonnes).toBe(0);
    expect(r.byCategory).toEqual([]);
  });

  it("distinguishes a not-reported month (gap) from a reported zero", () => {
    const r = rollupYear({
      entries: [
        { scope: "SCOPE_2", category: "Consumo de energía eléctrica", subcategory: null, element: "Consumo de energía eléctrica", month: 1, value: "0", secondaryValue: null, factor: null },
        { scope: "SCOPE_2", category: "Consumo de energía eléctrica", subcategory: null, element: "Consumo de energía eléctrica", month: 2, value: null, secondaryValue: null, factor: null },
      ],
      gridFactor: "0.217", fuelPrices: null,
      gwpSet: "AR6",
    });
    expect(r.scope2Monthly[0].tonnes).toBe(0); // reported zero
    expect(r.scope2Monthly[1].tonnes).toBeNull(); // not reported
  });
});

// Client feedback 2026-08-15: Scope 3 Cat 6 "Subsidios de transporte" is entered in COP and
// converted to gallons via a yearly price; Cat 6/7 distance categories are entered as a count and
// a distance, multiplied. Both derivations happen once, right before the entry's activity is
// priced, so every other entryMode (and the default QUANTITY) is provably untouched.
describe("rollupYear: MONEY_PER_GALLON (Scope 3 Subsidios de transporte)", () => {
  const moneyFactor: RollupFactor = {
    co2Factor: "10", // kg CO2 / gal, a normal per-gallon fuel factor
    ch4Factor: null,
    n2oFactor: null,
    co2eFactor: null,
    biogenic: false,
    entryMode: "MONEY_PER_GALLON",
    fuelType: "DIESEL",
  };

  const moneyEntry = (over: {
    element: string;
    fuelType: FuelType;
    value: string;
    co2Factor: string;
  }): RollupEntry => ({
    scope: "SCOPE_3",
    category: "C6: Viajes de negocios",
    subcategory: "Subsidios de transporte",
    element: over.element,
    month: null,
    value: over.value,
    secondaryValue: null,
    factor: { ...moneyFactor, co2Factor: over.co2Factor, fuelType: over.fuelType },
  });

  it("divides the reported money by the year's price per gallon before pricing", () => {
    // 1,000,000 COP / 5,000 COP per gal = 200 gal; 200 gal * 10 kg CO2/gal = 2000 kg = 2 t.
    const r = rollupYear({
      entries: [
        {
          scope: "SCOPE_3",
          category: "C6: Viajes de negocios",
          subcategory: "Subsidios de transporte",
          element: "C6: Diésel B10 (Mezcla comercial) - Móvil",
          month: null,
          value: "1000000",
          secondaryValue: null,
          factor: moneyFactor,
        },
      ],
      gridFactor: null,
      fuelPrices: { GASOLINE: null, DIESEL: "5000" },
      gwpSet: "AR6",
    });
    expect(r.totalTonnes).toBeCloseTo(2, 6);
    expect(r.missingTransportSubsidyPrice).toBe(false);
    expect(r.unpricedCount).toBe(0);
  });

  it("excludes the entry and flags the year when no price is loaded, rather than fabricating a zero", () => {
    const r = rollupYear({
      entries: [
        {
          scope: "SCOPE_3",
          category: "C6: Viajes de negocios",
          subcategory: "Subsidios de transporte",
          element: "C6: Diésel B10 (Mezcla comercial) - Móvil",
          month: null,
          value: "1000000",
          secondaryValue: null,
          factor: moneyFactor,
        },
      ],
      gridFactor: null,
      fuelPrices: null,
      gwpSet: "AR6",
    });
    expect(r.totalTonnes).toBe(0);
    expect(r.byCategory).toEqual([]);
    expect(r.missingTransportSubsidyPrice).toBe(true);
    expect(r.unpricedCount).toBe(1);
  });

  // Client feedback 2026-09-03 (E4): one price per fuel per year. Before this, both subsidy
  // factors divided by the single yearly price, so diesel was charged the gasoline price.
  it("divides a diesel subsidy by the diesel price, not the gasoline price", () => {
    // 1.000.000 COP of diesel at 9.574,157895 COP/gal is 104,4477 gal, not 62,3196.
    const r = rollupYear({
      entries: [
        moneyEntry({
          element: "C6: Diésel B10 (Mezcla comercial) - Móvil",
          fuelType: "DIESEL",
          value: "1000000",
          co2Factor: "10.2765",
        }),
      ],
      gridFactor: null,
      fuelPrices: { GASOLINE: "16046.315789", DIESEL: "9574.157895" },
      gwpSet: "AR6",
    });
    expect(r.byScope.SCOPE_3 * 1000).toBeCloseTo((1000000 / 9574.157895) * 10.2765, 4);
    expect(r.missingTransportSubsidyPrice).toBe(false);
  });

  it("reports a missing price when only the other fuel has one", () => {
    const r = rollupYear({
      entries: [
        moneyEntry({
          element: "C6: Diésel B10 (Mezcla comercial) - Móvil",
          fuelType: "DIESEL",
          value: "1000000",
          co2Factor: "10.2765",
        }),
      ],
      gridFactor: null,
      fuelPrices: { GASOLINE: "16046.315789", DIESEL: null },
      gwpSet: "AR6",
    });
    // Substituting the gasoline price here is exactly the bug the fuel column exists to stop.
    expect(r.missingTransportSubsidyPrice).toBe(true);
    expect(r.byScope.SCOPE_3).toBe(0);
    expect(r.unpricedCount).toBe(1);
  });

  it("treats a price of zero as missing rather than dividing by it", () => {
    const r = rollupYear({
      entries: [
        moneyEntry({
          element: "C6: Gasolina E10 (Comercial) - Móvil",
          fuelType: "GASOLINE",
          value: "1000000",
          co2Factor: "7.6181",
        }),
      ],
      gridFactor: null,
      fuelPrices: { GASOLINE: "0", DIESEL: null },
      gwpSet: "AR6",
    });
    // The admin form accepts "0". An Infinity or NaN total would propagate silently through
    // every scope, category and element; a flagged exclusion does not.
    expect(r.missingTransportSubsidyPrice).toBe(true);
    expect(Number.isFinite(r.byScope.SCOPE_3)).toBe(true);
    expect(Number.isFinite(r.totalTonnes)).toBe(true);
    expect(r.byScope.SCOPE_3).toBe(0);
  });
});

describe("rollupYear: COUNT_TIMES_DISTANCE (Scope 3 pasajeros*km / vehiculo*km)", () => {
  const distanceFactor: RollupFactor = {
    co2Factor: "0.1", // kg CO2 / pasajero*km
    ch4Factor: null,
    n2oFactor: null,
    co2eFactor: null,
    biogenic: false,
    entryMode: "COUNT_TIMES_DISTANCE",
  };

  it("multiplies the count by the distance before pricing", () => {
    // 4 pasajeros * 250 km = 1000 pasajero*km; 1000 * 0.1 kg CO2 = 100 kg = 0.1 t.
    const r = rollupYear({
      entries: [
        {
          scope: "SCOPE_3",
          category: "C6: Viajes de negocios",
          subcategory: "Viajes Aéreos",
          element: "Viajes aéreos - Recorridos intermedios (entre 500 km y 3500 km por recorrido)",
          month: null,
          value: "4",
          secondaryValue: "250",
          factor: distanceFactor,
        },
      ],
      gridFactor: null,
      fuelPrices: null,
      gwpSet: "AR6",
    });
    expect(r.totalTonnes).toBeCloseTo(0.1, 6);
  });

  it("treats either half missing as not-yet-reported (0), not a pricing failure", () => {
    const r = rollupYear({
      entries: [
        {
          scope: "SCOPE_3",
          category: "C6: Viajes de negocios",
          subcategory: "Viajes Aéreos",
          element: "Viajes aéreos - Recorridos intermedios (entre 500 km y 3500 km por recorrido)",
          month: null,
          value: "4",
          secondaryValue: null, // distance not yet entered
          factor: distanceFactor,
        },
      ],
      gridFactor: null,
      fuelPrices: null,
      gwpSet: "AR6",
    });
    // A real (zero) category entry, not an exclusion: this mirrors how a single missing
    // QUANTITY value already computes to 0 rather than being counted unpriced.
    expect(r.totalTonnes).toBe(0);
    expect(r.byCategory[0]?.tonnes).toBe(0);
    expect(r.unpricedCount).toBe(0);
  });

  // Client feedback 2026-09-03 (E3): a transport source is N routes, not one. Every source had
  // exactly one pair of numbers until trip rows existed, so these are the first cases that can
  // tell "sum of the products" apart from "product of the sums".
  const tripEntry = (over: {
    element: string;
    co2Factor: string;
    trips: { count: string; distanceKm: string }[];
    value?: string | null;
    secondaryValue?: string | null;
  }): RollupEntry => ({
    scope: "SCOPE_3",
    category: "C9: Transporte y distribución downstream",
    subcategory: "Transporte terrestre",
    element: over.element,
    month: null,
    value: over.value ?? null,
    secondaryValue: over.secondaryValue ?? null,
    trips: over.trips,
    factor: { ...distanceFactor, co2Factor: over.co2Factor },
  });

  it("prices a source from its trip rows, summing each product", () => {
    // 12 ton over 340 km plus 5 ton over 1.200 km is 10.080 ton*km. Multiplying the sums would
    // give 17 x 1.540 = 26.180, which is what the preview used to compute.
    const r = rollupYear({
      entries: [
        tripEntry({
          element: "C9: Transporte terrestre de carga (camiones de servicio medianos y pesados)",
          co2Factor: "0.127",
          trips: [
            { count: "12", distanceKm: "340" },
            { count: "5", distanceKm: "1200" },
          ],
        }),
      ],
      gridFactor: null,
      fuelPrices: null,
      gwpSet: "AR6",
    });
    expect(r.byScope.SCOPE_3 * 1000).toBeCloseTo((12 * 340 + 5 * 1200) * 0.127, 6);
  });

  it("falls back to value times secondaryValue when a source has no trip rows", () => {
    // A source entered before trip rows existed, and any loader that does not read them.
    const r = rollupYear({
      entries: [
        tripEntry({
          element: "C7: Carro particular",
          co2Factor: "0.1845",
          trips: [],
          value: "3",
          secondaryValue: "80",
        }),
      ],
      gridFactor: null,
      fuelPrices: null,
      gwpSet: "AR6",
    });
    expect(r.byScope.SCOPE_3 * 1000).toBeCloseTo(3 * 80 * 0.1845, 6);
  });

  it("treats a source with no trips and no value as not reported, contributing zero", () => {
    const r = rollupYear({
      entries: [
        tripEntry({
          element: "C7: Carro particular",
          co2Factor: "0.1845",
          trips: [],
          value: null,
          secondaryValue: null,
        }),
      ],
      gridFactor: null,
      fuelPrices: null,
      gwpSet: "AR6",
    });
    expect(r.byScope.SCOPE_3).toBe(0);
    expect(r.unpricedCount).toBe(0);
  });
});

// The ISO 14064-1 declaration the client asked for reports, per ELEMENT, the mass of each gas
// alongside the CO2e total. Nothing below category level carried a gas breakdown before, and the
// mass was never computed at all, so these are the invariants that make that table trustworthy:
// the per-gas columns must reconcile to the CO2e column, element by element, using the same GWPs
// the headline total was built from.
describe("rollupYear: per-element gas totals for the ISO 14064-1 declaration", () => {
  const AR6 = { co2: 1, ch4Fossil: 29.8, ch4NonFossil: 27, n2o: 273 };

  const co2eKgOf = (g: {
    co2MassKg: number;
    ch4FossilMassKg: number;
    ch4NonFossilMassKg: number;
    n2oMassKg: number;
    preBlendedCo2eKgByType: Record<string, number>;
  }) =>
    g.co2MassKg * AR6.co2 +
    g.ch4FossilMassKg * AR6.ch4Fossil +
    g.ch4NonFossilMassKg * AR6.ch4NonFossil +
    g.n2oMassKg * AR6.n2o +
    Object.values(g.preBlendedCo2eKgByType).reduce((s, v) => s + v, 0);

  const mixed: RollupEntry[] = [
    { scope: "SCOPE_1", category: "Fuentes Fijas", subcategory: null, element: "Diesel", month: null, value: "14957.10", secondaryValue: null, factor: perGas("10.149", "0.00001", "0.000006") },
    { scope: "SCOPE_1", category: "Fuentes Fijas", subcategory: null, element: "Biomasa", month: null, value: "1000", secondaryValue: null, factor: perGas("2", "0.5", "0.1", true) },
    { scope: "SCOPE_1", category: "Emisiones Fugitivas", subcategory: null, element: "R-22", month: null, value: "10", secondaryValue: null, factor: consolidated("1960", false, "HFC") },
    { scope: "SCOPE_3", category: "C1: Bienes", subcategory: null, element: "Cartón", month: null, value: "10", secondaryValue: null, factor: consolidated("500") },
    { scope: "SCOPE_2", category: "Consumo de energía eléctrica", subcategory: null, element: "Electricidad", month: 1, value: "1000", secondaryValue: null, factor: null },
  ];

  it("every element's gas columns reconcile to its own CO2e total", () => {
    const r = rollupYear({ entries: mixed, gridFactor: "0.217", fuelPrices: null, gwpSet: "AR6" });

    expect(r.byElement.length).toBeGreaterThan(0);
    for (const element of r.byElement) {
      expect(co2eKgOf(element.gases) / 1000).toBeCloseTo(element.tonnes, 9);
    }
  });

  it("reports gas MASS, not CO2e, in the mass columns", () => {
    const r = rollupYear({ entries: mixed, gridFactor: "0.217", fuelPrices: null, gwpSet: "AR6" });
    const diesel = r.byElement.find((e) => e.element === "Diesel")!;

    // 14957.10 gal x 0.00001 kg CH4/gal = 0.1495710 kg of methane, NOT 4.457 kg CO2e.
    expect(diesel.gases.ch4FossilMassKg).toBeCloseTo(0.149571, 9);
    expect(diesel.gases.co2MassKg).toBeCloseTo(14957.1 * 10.149, 6);
    expect(diesel.gases.n2oMassKg).toBeCloseTo(14957.1 * 0.000006, 9);
  });

  it("routes a biogenic element's CH4 to the non-fossil column and a fossil one to fossil", () => {
    const r = rollupYear({ entries: mixed, gridFactor: "0.217", fuelPrices: null, gwpSet: "AR6" });
    const biomasa = r.byElement.find((e) => e.element === "Biomasa")!;
    const diesel = r.byElement.find((e) => e.element === "Diesel")!;

    expect(biomasa.gases.ch4NonFossilMassKg).toBeCloseTo(500, 9);
    expect(biomasa.gases.ch4FossilMassKg).toBe(0);
    expect(diesel.gases.ch4FossilMassKg).toBeGreaterThan(0);
    expect(diesel.gases.ch4NonFossilMassKg).toBe(0);
  });

  it("keeps a pre-blended element as CO2e under its own gas name, with no mass claimed", () => {
    const r = rollupYear({ entries: mixed, gridFactor: "0.217", fuelPrices: null, gwpSet: "AR6" });
    const r22 = r.byElement.find((e) => e.element === "R-22")!;

    expect(r22.gases.preBlendedCo2eKgByType).toEqual({ HFC: 19600 });
    expect(r22.gases.co2MassKg).toBe(0);
    expect(r22.gases.ch4FossilMassKg).toBe(0);
    expect(r22.gases.n2oMassKg).toBe(0);
  });

  it("falls back to the unidentified bucket when a pre-blended factor carries no gasType", () => {
    const r = rollupYear({ entries: mixed, gridFactor: "0.217", fuelPrices: null, gwpSet: "AR6" });
    const carton = r.byElement.find((e) => e.element === "Cartón")!;
    expect(carton.gases.preBlendedCo2eKgByType).toEqual({ [OTHER_GAS_FALLBACK]: 5000 });
  });

  it("treats Scope 2 electricity as pure CO2 mass", () => {
    const r = rollupYear({ entries: mixed, gridFactor: "0.217", fuelPrices: null, gwpSet: "AR6" });
    const power = r.byElement.find((e) => e.element === "Electricidad")!;
    expect(power.gases.co2MassKg).toBeCloseTo(217, 9);
    expect(power.gases.preBlendedCo2eKgByType).toEqual({});
  });

  it("summing every element's gas columns reconciles to the grand total", () => {
    const r = rollupYear({ entries: mixed, gridFactor: "0.217", fuelPrices: null, gwpSet: "AR6" });
    const totalKg = r.byElement.reduce((sum, e) => sum + co2eKgOf(e.gases), 0);
    expect(totalKg / 1000).toBeCloseTo(r.totalTonnes, 9);
  });

  it("splits CH4 fossil and non-fossil at category level, still summing to ch4Tonnes", () => {
    const r = rollupYear({ entries: mixed, gridFactor: "0.217", fuelPrices: null, gwpSet: "AR6" });

    for (const category of r.byCategory) {
      expect(category.ch4FossilTonnes + category.ch4NonFossilTonnes).toBeCloseTo(
        category.ch4Tonnes,
        9,
      );
    }

    // Fuentes Fijas holds one fossil and one biogenic element, so both buckets are populated.
    const fijas = r.byCategory.find((c) => c.category === "Fuentes Fijas")!;
    expect(fijas.ch4FossilTonnes).toBeGreaterThan(0);
    expect(fijas.ch4NonFossilTonnes).toBeGreaterThan(0);
  });
});
