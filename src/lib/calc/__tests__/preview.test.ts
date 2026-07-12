import { describe, expect, it } from "vitest";
import { estimateSourceTonnes, type PreviewFactor } from "@/lib/calc/preview";

const NO_FACTORS: PreviewFactor = {
  co2Factor: null,
  ch4Factor: null,
  n2oFactor: null,
  co2eFactor: null,
  biogenic: false,
  factorUnit: null,
  source: null,
};

const factor = (over: Partial<PreviewFactor>): PreviewFactor => ({ ...NO_FACTORS, ...over });

describe("estimateSourceTonnes: consolidated CO2e", () => {
  it("multiplies activity by the CO2e factor and converts to tonnes", () => {
    // The Requirements worked example: 10 kg of R-22 at 1960 kg CO2e/kg = 19.6 t.
    const result = estimateSourceTonnes({
      values: ["10"],
      scope: "SCOPE_1",
      factor: factor({ co2eFactor: "1960", factorUnit: "kg CO2e/kg", source: "IPCC AR6" }),
      gridFactor: null,
      gwpSet: "AR6",
    });

    expect(result).toMatchObject({ kind: "ok", tonnes: 19.6, hasValues: true });
  });

  it("short-circuits the per-gas math when a CO2e factor is present", () => {
    const result = estimateSourceTonnes({
      values: ["1"],
      scope: "SCOPE_1",
      // co2eFactor wins; the per-gas values must be ignored, exactly as computeCo2eKg does.
      factor: factor({ co2eFactor: "1000", co2Factor: "999999" }),
      gridFactor: null,
      gwpSet: "AR6",
    });

    expect(result).toMatchObject({ kind: "ok", tonnes: 1 });
  });
});

describe("estimateSourceTonnes: per-gas math", () => {
  it("applies the GWP of each gas", () => {
    // 100 * (2*1 + 0.1*29.8 + 0.01*273) = 100 * (2 + 2.98 + 2.73) = 771 kg = 0.771 t
    const result = estimateSourceTonnes({
      values: ["100"],
      scope: "SCOPE_1",
      factor: factor({ co2Factor: "2", ch4Factor: "0.1", n2oFactor: "0.01" }),
      gridFactor: null,
      gwpSet: "AR6",
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.tonnes).toBeCloseTo(0.771, 10);
  });

  it("uses the non-fossil CH4 GWP for a biogenic source (AR6: 27, not 29.8)", () => {
    const fossil = estimateSourceTonnes({
      values: ["1000"],
      scope: "SCOPE_1",
      factor: factor({ ch4Factor: "1", biogenic: false }),
      gridFactor: null,
      gwpSet: "AR6",
    });
    const biogenic = estimateSourceTonnes({
      values: ["1000"],
      scope: "SCOPE_1",
      factor: factor({ ch4Factor: "1", biogenic: true }),
      gridFactor: null,
      gwpSet: "AR6",
    });

    expect(fossil).toMatchObject({ kind: "ok", tonnes: 29.8 });
    expect(biogenic).toMatchObject({ kind: "ok", tonnes: 27 });
  });

  it("uses AR5 values for a pre-2022 reporting year", () => {
    const result = estimateSourceTonnes({
      values: ["1000"],
      scope: "SCOPE_1",
      factor: factor({ ch4Factor: "1" }),
      gridFactor: null,
      gwpSet: "AR5",
    });

    expect(result).toMatchObject({ kind: "ok", tonnes: 28 });
  });
});

describe("estimateSourceTonnes: Scope 2", () => {
  it("uses the grid factor for the year, not the factor row", () => {
    // Requirements worked example: 500000 kWh in 2024 at 0.217 = 108.5 t.
    const result = estimateSourceTonnes({
      values: ["500000"],
      scope: "SCOPE_2",
      factor: factor({}),
      gridFactor: { factor: "0.217", source: "UPME/XM" },
      gwpSet: "AR6",
    });

    expect(result).toMatchObject({
      kind: "ok",
      tonnes: 108.5,
      factorUnit: "kg CO2/kWh",
      factorSource: "UPME/XM",
    });
  });

  it("sums the twelve month cells", () => {
    const result = estimateSourceTonnes({
      values: Array.from({ length: 12 }, () => "1000"),
      scope: "SCOPE_2",
      factor: null,
      gridFactor: { factor: "0.5", source: null },
      gwpSet: "AR6",
    });

    expect(result).toMatchObject({ kind: "ok", tonnes: 6 }); // 12000 * 0.5 = 6000 kg
  });

  it("reports a missing grid factor instead of computing zero", () => {
    const result = estimateSourceTonnes({
      values: ["500000"],
      scope: "SCOPE_2",
      factor: factor({}),
      gridFactor: null,
      gwpSet: "AR6",
    });

    expect(result).toEqual({ kind: "missingGridFactor" });
  });
});

describe("estimateSourceTonnes: honest failure states", () => {
  it("reports noFactor when the factor row was orphaned by SetNull", () => {
    const result = estimateSourceTonnes({
      values: ["10"],
      scope: "SCOPE_1",
      factor: null,
      gridFactor: null,
      gwpSet: "AR6",
    });

    expect(result).toEqual({ kind: "noFactor" });
  });

  it("reports noFactor when every factor column is empty", () => {
    const result = estimateSourceTonnes({
      values: ["10"],
      scope: "SCOPE_3",
      factor: factor({}),
      gridFactor: null,
      gwpSet: "AR6",
    });

    expect(result).toEqual({ kind: "noFactor" });
  });
});

describe("estimateSourceTonnes: raw store values", () => {
  it("normalizes a Colombian decimal comma before summing", () => {
    // Number("1240,5") is NaN. The store holds raw keystrokes, so this is the common case.
    const result = estimateSourceTonnes({
      values: ["1240,5"],
      scope: "SCOPE_1",
      factor: factor({ co2eFactor: "1000" }),
      gridFactor: null,
      gwpSet: "AR6",
    });

    expect(result).toMatchObject({ kind: "ok", tonnes: 1240.5 });
  });

  it("ignores blank and half-typed cells rather than poisoning the sum", () => {
    const result = estimateSourceTonnes({
      values: ["10", "", "12,", "abc", "-5", "5"],
      scope: "SCOPE_1",
      factor: factor({ co2eFactor: "1000" }),
      gridFactor: null,
      gwpSet: "AR6",
    });

    // Only "10" and "5" are valid: 15 kg-units * 1000 = 15000 kg = 15 t.
    expect(result).toMatchObject({ kind: "ok", tonnes: 15 });
  });

  it("reports hasValues false when nothing is reported yet, and still returns ok", () => {
    const result = estimateSourceTonnes({
      values: ["", "", ""],
      scope: "SCOPE_1",
      factor: factor({ co2eFactor: "1000" }),
      gridFactor: null,
      gwpSet: "AR6",
    });

    expect(result).toMatchObject({ kind: "ok", tonnes: 0, hasValues: false });
  });
});
