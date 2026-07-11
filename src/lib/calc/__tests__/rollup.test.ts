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
        { scope: "SCOPE_1", category: "Emisiones Fugitivas", month: null, value: "10", factor: consolidated("1960") },
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
        { scope: "SCOPE_2", category: "Consumo de energía eléctrica", month: 1, value: "500000", factor: null },
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
    { scope: "SCOPE_1", category: "Fuentes Fijas", month: null, value: "10", factor: consolidated("100") }, // 1 t
    { scope: "SCOPE_1", category: "Fuentes Fijas", month: null, value: "5", factor: consolidated("100") }, // 0.5 t
    { scope: "SCOPE_1", category: "Emisiones Fugitivas", month: null, value: "2", factor: consolidated("1000") }, // 2 t
    { scope: "SCOPE_3", category: "Residuos", month: null, value: "10", factor: consolidated("500") }, // 5 t
    { scope: "SCOPE_2", category: "Consumo de energía eléctrica", month: 1, value: "1000", factor: null }, // 0.5 t
    { scope: "SCOPE_2", category: "Consumo de energía eléctrica", month: 2, value: "2000", factor: null }, // 1 t
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

describe("rollupYear: honest edge cases", () => {
  it("flags a missing grid factor and contributes zero for Scope 2", () => {
    const r = rollupYear({
      entries: [
        { scope: "SCOPE_2", category: "Consumo de energía eléctrica", month: 1, value: "500000", factor: null },
      ],
      gridFactor: null,
      gwpSet: "AR6",
    });
    expect(r.missingGridFactor).toBe(true);
    expect(r.byScope.SCOPE_2).toBe(0);
  });

  it("tracks biogenic tonnes as a memo without excluding them from the total", () => {
    const r = rollupYear({
      entries: [
        { scope: "SCOPE_3", category: "Residuos", month: null, value: "100", factor: consolidated("10", true) }, // 1 t, biogenic
        { scope: "SCOPE_1", category: "Fuentes Fijas", month: null, value: "100", factor: consolidated("10") }, // 1 t, fossil
      ],
      gridFactor: null,
      gwpSet: "AR6",
    });
    expect(r.totalTonnes).toBeCloseTo(2, 6);
    expect(r.biogenicTonnes).toBeCloseTo(1, 6);
  });

  it("skips a Scope 1 row whose factor was removed rather than counting zero", () => {
    const r = rollupYear({
      entries: [
        { scope: "SCOPE_1", category: "Fuentes Fijas", month: null, value: "100", factor: null },
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
        { scope: "SCOPE_2", category: "Consumo de energía eléctrica", month: 1, value: "0", factor: null },
        { scope: "SCOPE_2", category: "Consumo de energía eléctrica", month: 2, value: null, factor: null },
      ],
      gridFactor: "0.217",
      gwpSet: "AR6",
    });
    expect(r.scope2Monthly[0].tonnes).toBe(0); // reported zero
    expect(r.scope2Monthly[1].tonnes).toBeNull(); // not reported
  });
});
