import { describe, expect, it } from "vitest";
import { rollupYear, type RollupEntry, type RollupFactor } from "@/lib/calc/rollup";

const consolidated = (co2e: string, biogenic = false): RollupFactor => ({
  co2Factor: null,
  ch4Factor: null,
  n2oFactor: null,
  co2eFactor: co2e,
  biogenic,
});

const perGas = (
  co2: string | null,
  ch4: string | null,
  n2o: string | null,
  biogenic = false,
): RollupFactor => ({ co2Factor: co2, ch4Factor: ch4, n2oFactor: n2o, co2eFactor: null, biogenic });

describe("rollupYear: the Requirements worked examples", () => {
  it("refrigerant leak: 10 kg of R-22 at 1960 kg CO2e/kg is 19.6 t (Scope 1)", () => {
    const r = rollupYear({
      entries: [
        { scope: "SCOPE_1", category: "Emisiones Fugitivas", subcategory: null, element: "Emisiones Fugitivas", month: null, value: "10", factor: consolidated("1960") },
      ],
      gridFactor: null,
      gwpSet: "AR6",
    });
    expect(r.byScope.SCOPE_1).toBeCloseTo(19.6, 6);
    expect(r.totalTonnes).toBeCloseTo(19.6, 6);
  });

  it("electricity: 500000 kWh in 2024 at 0.217 is 108.5 t (Scope 2)", () => {
    const r = rollupYear({
      entries: [
        { scope: "SCOPE_2", category: "Consumo de energía eléctrica", subcategory: null, element: "Consumo de energía eléctrica", month: 1, value: "500000", factor: null },
      ],
      gridFactor: "0.217",
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
          value: "14957.10",
          factor: perGas("10.149", "0.00001", "0.000006"),
        },
      ],
      gridFactor: null,
      gwpSet: "AR6",
    });
    expect(r.byScope.SCOPE_1).toBeCloseTo(151.8285648, 6);
  });
});

describe("rollupYear: aggregation", () => {
  const entries: RollupEntry[] = [
    { scope: "SCOPE_1", category: "Fuentes Fijas", subcategory: null, element: "Fuentes Fijas", month: null, value: "10", factor: consolidated("100") }, // 1 t
    { scope: "SCOPE_1", category: "Fuentes Fijas", subcategory: null, element: "Fuentes Fijas", month: null, value: "5", factor: consolidated("100") }, // 0.5 t
    { scope: "SCOPE_1", category: "Emisiones Fugitivas", subcategory: null, element: "Emisiones Fugitivas", month: null, value: "2", factor: consolidated("1000") }, // 2 t
    { scope: "SCOPE_3", category: "Residuos", subcategory: null, element: "Residuos", month: null, value: "10", factor: consolidated("500") }, // 5 t
    { scope: "SCOPE_2", category: "Consumo de energía eléctrica", subcategory: null, element: "Consumo de energía eléctrica", month: 1, value: "1000", factor: null }, // 0.5 t
    { scope: "SCOPE_2", category: "Consumo de energía eléctrica", subcategory: null, element: "Consumo de energía eléctrica", month: 2, value: "2000", factor: null }, // 1 t
  ];

  it("sums per scope and overall", () => {
    const r = rollupYear({ entries, gridFactor: "0.5", gwpSet: "AR6" });
    expect(r.byScope.SCOPE_1).toBeCloseTo(3.5, 6);
    expect(r.byScope.SCOPE_2).toBeCloseTo(1.5, 6);
    expect(r.byScope.SCOPE_3).toBeCloseTo(5, 6);
    expect(r.totalTonnes).toBeCloseTo(10, 6);
  });

  it("groups by category, largest first, merging same-category rows", () => {
    const r = rollupYear({ entries, gridFactor: "0.5", gwpSet: "AR6" });
    expect(r.byCategory[0]).toMatchObject({ category: "Residuos", tonnes: 5 });
    const fijas = r.byCategory.find((c) => c.category === "Fuentes Fijas");
    expect(fijas?.tonnes).toBeCloseTo(1.5, 6); // 10 and 5 merged
  });

  it("places Scope 2 tonnes in the right months and leaves the rest as gaps", () => {
    const r = rollupYear({ entries, gridFactor: "0.5", gwpSet: "AR6" });
    expect(r.scope2Monthly[0].tonnes).toBeCloseTo(0.5, 6);
    expect(r.scope2Monthly[1].tonnes).toBeCloseTo(1, 6);
    // Months 3..12 were never reported: null, not 0.
    expect(r.scope2Monthly[2].tonnes).toBeNull();
    expect(r.scope2Monthly[11].tonnes).toBeNull();
  });
});

// Requirements 7.4: element -> subcategory -> category -> scope -> company. The roll-up used to
// stop at category, so any drill-down or export had to re-group the raw entries itself, i.e. build
// a second engine. These levels exist so there is only ever one.
describe("rollupYear: the full 7.4 hierarchy", () => {
  const hierarchy: RollupEntry[] = [
    // Two elements under one subcategory.
    { scope: "SCOPE_1", category: "Fuentes Fijas", subcategory: "Combustibles Líquidos (fijos)", element: "Diesel", month: null, value: "10", factor: consolidated("100") }, // 1 t
    { scope: "SCOPE_1", category: "Fuentes Fijas", subcategory: "Combustibles Líquidos (fijos)", element: "Fuel Oil", month: null, value: "20", factor: consolidated("100") }, // 2 t
    // A second subcategory in the same category.
    { scope: "SCOPE_1", category: "Fuentes Fijas", subcategory: "Combustibles Gaseosos", element: "Gas Natural", month: null, value: "30", factor: consolidated("100") }, // 3 t
    // A category with no subcategory: null is normal, not an error.
    { scope: "SCOPE_3", category: "Residuos", subcategory: null, element: "Residuos ordinarios", month: null, value: "40", factor: consolidated("100") }, // 4 t
  ];

  it("totals each element, largest first", () => {
    const r = rollupYear({ entries: hierarchy, gridFactor: null, gwpSet: "AR6" });

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
    const r = rollupYear({ entries: hierarchy, gridFactor: null, gwpSet: "AR6" });

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
      value: "1000",
      factor: null,
    }));

    const r = rollupYear({ entries: monthly, gridFactor: "0.5", gwpSet: "AR6" });

    expect(r.byElement).toHaveLength(1);
    expect(r.byElement[0].tonnes).toBeCloseTo(6, 6); // 12 x 1000 x 0.5 kg = 6 t
  });

  it("RECONCILES: each level sums to its parent, which is what makes a drill-down trustworthy", () => {
    const r = rollupYear({ entries: hierarchy, gridFactor: null, gwpSet: "AR6" });
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
        { scope: "SCOPE_1", category: "Fuentes Fijas", subcategory: "Combustibles Gaseosos", element: "Gas sin factor", month: null, value: "999", factor: null },
      ],
      gridFactor: null,
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
        { scope: "SCOPE_2", category: "Consumo de energía eléctrica", subcategory: null, element: "Consumo de energía eléctrica", month: 1, value: "500000", factor: null },
      ],
      gridFactor: null,
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
    };

    const r = rollupYear({
      entries: [
        { scope: "SCOPE_3", category: "C1: Bienes y servicios adquiridos", subcategory: null, element: "C1: Bienes y servicios adquiridos", month: null, value: "1000000", factor: spendOnly },
      ],
      gridFactor: null,
      gwpSet: "AR6",
    });

    expect(r.totalTonnes).toBe(0);
    expect(r.byCategory).toEqual([]);
    expect(r.unpricedCount).toBe(1);
  });

  it("counts every unpriced entry, so a total can say it is incomplete", () => {
    const r = rollupYear({
      entries: [
        { scope: "SCOPE_2", category: "Consumo de energía eléctrica", subcategory: null, element: "Consumo de energía eléctrica", month: 1, value: "100", factor: null },
        { scope: "SCOPE_1", category: "Fuentes Fijas", subcategory: null, element: "Fuentes Fijas", month: null, value: "100", factor: null },
        { scope: "SCOPE_1", category: "Fuentes Fijas", subcategory: null, element: "Fuentes Fijas", month: null, value: "100", factor: consolidated("10") },
      ],
      gridFactor: null,
      gwpSet: "AR6",
    });

    expect(r.unpricedCount).toBe(2); // the Scope 2 row and the factorless Scope 1 row
    expect(r.totalTonnes).toBeCloseTo(1, 6); // only the one priceable row
  });

  it("tracks biogenic tonnes as a memo without excluding them from the total", () => {
    const r = rollupYear({
      entries: [
        { scope: "SCOPE_3", category: "Residuos", subcategory: null, element: "Residuos", month: null, value: "100", factor: consolidated("10", true) }, // 1 t, biogenic
        { scope: "SCOPE_1", category: "Fuentes Fijas", subcategory: null, element: "Fuentes Fijas", month: null, value: "100", factor: consolidated("10") }, // 1 t, fossil
      ],
      gridFactor: null,
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
          value: "100",
          factor: perGas("1664.92", "0.001", "0.0001", true),
        },
      ],
      gridFactor: null,
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
        { scope: "SCOPE_3", category: "Residuos", subcategory: null, element: "Residuos", month: null, value: "100", factor: consolidated("10", true) },
      ],
      gridFactor: null,
      gwpSet: "AR6",
    });

    expect(r.biogenicTonnes).toBeCloseTo(1, 6);
    expect(r.biogenicCo2Tonnes).toBe(0);
    expect(r.biogenicCo2Partial).toBe(true);
  });

  it("skips a Scope 1 row whose factor was removed rather than counting zero", () => {
    const r = rollupYear({
      entries: [
        { scope: "SCOPE_1", category: "Fuentes Fijas", subcategory: null, element: "Fuentes Fijas", month: null, value: "100", factor: null },
      ],
      gridFactor: null,
      gwpSet: "AR6",
    });
    expect(r.totalTonnes).toBe(0);
    expect(r.byCategory).toEqual([]);
  });

  it("distinguishes a not-reported month (gap) from a reported zero", () => {
    const r = rollupYear({
      entries: [
        { scope: "SCOPE_2", category: "Consumo de energía eléctrica", subcategory: null, element: "Consumo de energía eléctrica", month: 1, value: "0", factor: null },
        { scope: "SCOPE_2", category: "Consumo de energía eléctrica", subcategory: null, element: "Consumo de energía eléctrica", month: 2, value: null, factor: null },
      ],
      gridFactor: "0.217",
      gwpSet: "AR6",
    });
    expect(r.scope2Monthly[0].tonnes).toBe(0); // reported zero
    expect(r.scope2Monthly[1].tonnes).toBeNull(); // not reported
  });
});
