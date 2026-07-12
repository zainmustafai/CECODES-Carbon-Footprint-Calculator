import { describe, expect, it } from "vitest";
import { computeCo2eKg } from "@/lib/calc/engine";
import { CH4_GWP_RULE, isFuelCategory, usesNonFossilCh4 } from "@/lib/calc/ch4-rule";

// The open question in Requirements 12.A5, and the likeliest cause of the first parity failure.
// These tests do not claim to know the answer. They pin BOTH candidate rules so that:
//   1. the current default cannot change by accident, and
//   2. when CECODES's workbook arrives, the parity harness can run it under each rule and see
//      which one reproduces their totals. An empirical answer beats an opinion.

describe("the rule in force", () => {
  it("is the biogenic-flag rule until CECODES answers memo item 1", () => {
    expect(CH4_GWP_RULE).toBe("biogenic-flag");
  });
});

describe("isFuelCategory", () => {
  it("treats stationary and mobile combustion as fuels", () => {
    expect(isFuelCategory("Fuentes Fijas")).toBe(true);
    expect(isFuelCategory("Fuentes Móviles")).toBe(true);
  });

  it("treats everything else as not a fuel", () => {
    // These are exactly the categories where the two rules disagree: the Excel's gloss would
    // give all of them the NON-fossil CH4 value (27), while our biogenic-flag rule gives the
    // non-biogenic ones the fossil value (29.8).
    expect(isFuelCategory("Emisiones Fugitivas")).toBe(false);
    expect(isFuelCategory("Procesos industriales")).toBe(false);
    expect(isFuelCategory("Cambios Uso Suelo")).toBe(false);
    expect(isFuelCategory("C1: Bienes y servicios adquiridos")).toBe(false);
    expect(isFuelCategory("Consumo de energía eléctrica")).toBe(false);
  });

  it("survives whitespace and absence", () => {
    expect(isFuelCategory("  Fuentes Fijas  ")).toBe(true);
    expect(isFuelCategory(null)).toBe(false);
    expect(isFuelCategory(undefined)).toBe(false);
    expect(isFuelCategory("")).toBe(false);
  });
});

describe("usesNonFossilCh4: the two rules disagree, in both directions", () => {
  // Case A: a BIOGENIC FUEL (bagazo, biodiesel). 17 Fuentes Fijas + 3 Fuentes Móviles rows.
  const biogenicFuel = { biogenic: true, isFuel: true };

  it("biogenic fuel: our rule says non-fossil (27), a literal reading of the Excel says fossil (29.8)", () => {
    expect(usesNonFossilCh4(biogenicFuel, "biogenic-flag")).toBe(true); // -> 27
    expect(usesNonFossilCh4(biogenicFuel, "is-a-fuel")).toBe(false); // -> 29.8
  });

  // Case B: a NON-BIOGENIC NON-FUEL (fugitive leaks, industrial processes, land use).
  // 115 + 45 + 15 rows.
  const fossilNonFuel = { biogenic: false, isFuel: false };

  it("non-biogenic non-fuel: our rule says fossil (29.8), the Excel's gloss says non-fossil (27)", () => {
    expect(usesNonFossilCh4(fossilNonFuel, "biogenic-flag")).toBe(false); // -> 29.8
    expect(usesNonFossilCh4(fossilNonFuel, "is-a-fuel")).toBe(true); // -> 27
  });

  it("the two rules AGREE on a fossil fuel and on a biogenic non-fuel", () => {
    // Fossil fuel (diesel): fossil CH4 under both readings.
    expect(usesNonFossilCh4({ biogenic: false, isFuel: true }, "biogenic-flag")).toBe(false);
    expect(usesNonFossilCh4({ biogenic: false, isFuel: true }, "is-a-fuel")).toBe(false);

    // Biogenic non-fuel (organic waste): non-fossil CH4 under both readings.
    expect(usesNonFossilCh4({ biogenic: true, isFuel: false }, "biogenic-flag")).toBe(true);
    expect(usesNonFossilCh4({ biogenic: true, isFuel: false }, "is-a-fuel")).toBe(true);
  });

  it("defaults to the rule in force when none is passed", () => {
    expect(usesNonFossilCh4(biogenicFuel)).toBe(usesNonFossilCh4(biogenicFuel, CH4_GWP_RULE));
  });
});

describe("the rule changes real numbers, which is why it must be settled", () => {
  it("prices 1 kg of CH4 from a biogenic fuel differently under each rule", () => {
    const factor = { ch4Factor: 1, biogenic: true, isFuel: true };

    expect(computeCo2eKg(1, factor, "AR6", "biogenic-flag")).toBeCloseTo(27, 9);
    expect(computeCo2eKg(1, factor, "AR6", "is-a-fuel")).toBeCloseTo(29.8, 9);
  });

  it("prices 1 kg of CH4 from a fugitive leak differently under each rule", () => {
    const factor = { ch4Factor: 1, biogenic: false, isFuel: false };

    expect(computeCo2eKg(1, factor, "AR6", "biogenic-flag")).toBeCloseTo(29.8, 9);
    expect(computeCo2eKg(1, factor, "AR6", "is-a-fuel")).toBeCloseTo(27, 9);
  });

  it("leaves a consolidated CO2e factor untouched under either rule", () => {
    // Refrigerants and spend-based rows arrive pre-combined: no CH4 term to select a GWP for.
    const factor = { co2eFactor: 1960, biogenic: true, isFuel: true };
    expect(computeCo2eKg(10, factor, "AR6", "biogenic-flag")).toBe(19_600);
    expect(computeCo2eKg(10, factor, "AR6", "is-a-fuel")).toBe(19_600);
  });
});
