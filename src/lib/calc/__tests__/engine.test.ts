import { describe, expect, it } from "vitest";
import { computeCo2eKg } from "@/lib/calc/engine";
import { GWP } from "@/lib/gwp";

// The engine is the one function every number in this product passes through, and until now it
// had no test of its own: it was only exercised transitively through rollupYear and the preview.
// These tests pin its behaviour directly, so a change to the roll-up cannot hide a change to the
// per-source maths.
//
// NOTE: passing these proves the engine is SELF-CONSISTENT. It does not prove Excel parity.
// See parity.test.ts.

describe("computeCo2eKg: the consolidated CO2e short-circuit", () => {
  it("multiplies activity by co2eFactor and ignores the per-gas columns entirely", () => {
    // Refrigerants, SF6/NF3 and spend/distance-based factors arrive pre-combined.
    const kg = computeCo2eKg(
      10,
      { co2eFactor: 1960, co2Factor: 999, ch4Factor: 999, n2oFactor: 999 },
      "AR6",
    );
    expect(kg).toBe(19_600);
  });

  it("short-circuits on a co2eFactor of 0, which is a real value, not a missing one", () => {
    // `!= null` is load-bearing here: a truthiness check would fall through to the per-gas
    // branch and silently compute a different number.
    expect(computeCo2eKg(1000, { co2eFactor: 0, co2Factor: 5 }, "AR6")).toBe(0);
  });

  it("is unaffected by the GWP set, because the gases are already combined", () => {
    const ar5 = computeCo2eKg(10, { co2eFactor: 1960 }, "AR5");
    const ar6 = computeCo2eKg(10, { co2eFactor: 1960 }, "AR6");
    expect(ar5).toBe(ar6);
  });
});

describe("computeCo2eKg: the per-gas path", () => {
  it("sums CO2 + CH4*GWP + N2O*GWP", () => {
    // 100 units, co2 2, ch4 0.5, n2o 0.1, AR6 (co2 1, ch4Fossil 29.8, n2o 273).
    // co2 = 100 * 2   * 1    =   200
    // ch4 = 100 * 0.5 * 29.8 =  1490
    // n2o = 100 * 0.1 * 273  =  2730
    const kg = computeCo2eKg(
      100,
      { co2Factor: 2, ch4Factor: 0.5, n2oFactor: 0.1 },
      "AR6",
    );
    expect(kg).toBeCloseTo(200 + 1490 + 2730, 9);
  });

  it("treats a missing gas column as zero, not as a reason to bail out", () => {
    // A CO2-only factor is normal (most combustion rows carry no N2O).
    expect(computeCo2eKg(10, { co2Factor: 3 }, "AR6")).toBeCloseTo(30, 9);
    expect(computeCo2eKg(10, { ch4Factor: null, n2oFactor: null, co2Factor: 3 }, "AR6"))
      .toBeCloseTo(30, 9);
  });

  it("returns 0 when every gas column is empty, so an unpriced source cannot invent emissions", () => {
    // The CALLER is responsible for not aggregating this: rollup.ts skips a factorless row
    // rather than counting a 0. See rollup.test.ts.
    expect(computeCo2eKg(1000, {}, "AR6")).toBe(0);
  });

  it("scales linearly with activity", () => {
    const one = computeCo2eKg(1, { co2Factor: 2, ch4Factor: 0.5 }, "AR6");
    expect(computeCo2eKg(1000, { co2Factor: 2, ch4Factor: 0.5 }, "AR6")).toBeCloseTo(
      one * 1000,
      9,
    );
  });
});

// This is the rule most likely to be wrong, and the one the client memo asks about (item 1).
// The Excel's own GWP sheet (Hoja2) glosses the two CH4 values as "SÓLO COMBUSTIBLES" (29.8)
// and "LO QUE NO ES COMBUSTIBLE" (27), i.e. it selects by whether the source is a FUEL. This
// engine selects by the BIOGENIC flag. The two rules disagree on roughly 180 rows of the factor
// library. These tests pin what we do TODAY so that switching the rule is a visible, tested
// change rather than a silent one.
describe("computeCo2eKg: which CH4 GWP is selected", () => {
  it("uses the FOSSIL CH4 GWP for a non-biogenic source", () => {
    const kg = computeCo2eKg(1, { ch4Factor: 1 }, "AR6");
    expect(kg).toBeCloseTo(GWP.AR6.ch4Fossil, 9);
    expect(kg).toBeCloseTo(29.8, 9);
  });

  it("uses the NON-FOSSIL CH4 GWP for a biogenic source", () => {
    const kg = computeCo2eKg(1, { ch4Factor: 1, biogenic: true }, "AR6");
    expect(kg).toBeCloseTo(GWP.AR6.ch4NonFossil, 9);
    expect(kg).toBeCloseTo(27, 9);
  });

  it("the biogenic flag changes ONLY the CH4 term, never CO2 or N2O", () => {
    const fossil = computeCo2eKg(10, { co2Factor: 2, n2oFactor: 0.1 }, "AR6");
    const bio = computeCo2eKg(10, { co2Factor: 2, n2oFactor: 0.1, biogenic: true }, "AR6");
    // No CH4 column, so the flag has nothing to switch: the two must be identical.
    expect(bio).toBe(fossil);
  });

  it("biogenic CO2 is NOT zero-rated: it is multiplied by a GWP of 1 like any other CO2", () => {
    // Requirements 12.A5 asks whether biogenic CO2 should be excluded from the headline. It is
    // currently INCLUDED (and separately disclosed as a memo item by rollupYear). If that
    // decision flips, this test is the one that must change.
    expect(computeCo2eKg(100, { co2Factor: 2, biogenic: true }, "AR6")).toBeCloseTo(200, 9);
  });

  it("AR5 makes no fossil/non-fossil CH4 distinction, so the biogenic flag is inert there", () => {
    const fossil = computeCo2eKg(1, { ch4Factor: 1 }, "AR5");
    const bio = computeCo2eKg(1, { ch4Factor: 1, biogenic: true }, "AR5");
    expect(fossil).toBe(bio);
    expect(fossil).toBeCloseTo(28, 9);
  });
});

describe("computeCo2eKg: GWP sets", () => {
  it("AR6 and AR5 give different answers for the same CH4 and N2O", () => {
    const ar5 = computeCo2eKg(1, { ch4Factor: 1, n2oFactor: 1 }, "AR5");
    const ar6 = computeCo2eKg(1, { ch4Factor: 1, n2oFactor: 1 }, "AR6");
    expect(ar5).toBeCloseTo(28 + 265, 9);
    expect(ar6).toBeCloseTo(29.8 + 273, 9);
    expect(ar5).not.toBe(ar6);
  });

  it("matches the GWP values printed in the client's own workbook (Hoja2)", () => {
    // The Excel's GWP sheet: CO2 1, CH4 fossil 29.8, CH4 non-fossil 27, N2O 273, SF6 24300,
    // NF3 17400. Our AR6 table must agree with it exactly, or nothing downstream can.
    expect(GWP.AR6.co2).toBe(1);
    expect(GWP.AR6.ch4Fossil).toBe(29.8);
    expect(GWP.AR6.ch4NonFossil).toBe(27);
    expect(GWP.AR6.n2o).toBe(273);
    expect(GWP.AR6.sf6).toBe(24300);
    expect(GWP.AR6.nf3).toBe(17400);
  });
});

describe("computeCo2eKg: numeric edges", () => {
  it("zero activity is zero emissions, for every factor shape", () => {
    expect(computeCo2eKg(0, { co2eFactor: 1960 }, "AR6")).toBe(0);
    expect(computeCo2eKg(0, { co2Factor: 2, ch4Factor: 1 }, "AR6")).toBe(0);
  });

  it("holds precision on the kind of value the Excel actually contains", () => {
    // 14957.10 gal of diesel at 10.149 kg CO2/gal.
    expect(computeCo2eKg(14957.1, { co2Factor: 10.149 }, "AR6")).toBeCloseTo(151799.6079, 4);
  });
});
