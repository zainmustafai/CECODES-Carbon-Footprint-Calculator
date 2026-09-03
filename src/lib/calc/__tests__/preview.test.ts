import { describe, expect, it } from "vitest";
import { estimateSourceTonnes, listFactorGases, type PreviewFactor } from "@/lib/calc/preview";

const NO_FACTORS: PreviewFactor = {
  co2Factor: null,
  ch4Factor: null,
  n2oFactor: null,
  co2eFactor: null,
  biogenic: false,
  factorUnit: null,
  source: null,
  entryMode: "QUANTITY",
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
      pricePerGallon: null,
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
      pricePerGallon: null,
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
      pricePerGallon: null,
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
      pricePerGallon: null,
      gwpSet: "AR6",
    });
    const biogenic = estimateSourceTonnes({
      values: ["1000"],
      scope: "SCOPE_1",
      factor: factor({ ch4Factor: "1", biogenic: true }),
      gridFactor: null,
      pricePerGallon: null,
      gwpSet: "AR6",
    });

    expect(fossil).toMatchObject({ kind: "ok", tonnes: 29.8 });
    expect(biogenic).toMatchObject({ kind: "ok", tonnes: 27 });
  });

  it("uses AR5 values for a year whose stored gwpSet pins AR5", () => {
    const result = estimateSourceTonnes({
      values: ["1000"],
      scope: "SCOPE_1",
      factor: factor({ ch4Factor: "1" }),
      gridFactor: null,
      pricePerGallon: null,
      gwpSet: "AR5",
    });

    // Non-biogenic CH4 under AR5 takes the fossil value, 30 (the client's GWP table).
    expect(result).toMatchObject({ kind: "ok", tonnes: 30 });
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
      pricePerGallon: null,
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
      pricePerGallon: null,
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
      pricePerGallon: null,
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
      pricePerGallon: null,
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
      pricePerGallon: null,
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
      pricePerGallon: null,
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
      pricePerGallon: null,
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
      pricePerGallon: null,
      gwpSet: "AR6",
    });

    expect(result).toMatchObject({ kind: "ok", tonnes: 0, hasValues: false });
  });
});

// Client feedback 2026-08-15: the live estimate popover must show the same derived math as
// rollupYear for the two new Scope 3 entry modes, not just the persisted/official totals.
describe("estimateSourceTonnes: MONEY_PER_GALLON", () => {
  it("divides the reported money by the price per gallon, and surfaces the derived gallons", () => {
    const result = estimateSourceTonnes({
      values: ["1000000"],
      scope: "SCOPE_3",
      factor: factor({ co2Factor: "10", entryMode: "MONEY_PER_GALLON", fuelType: "GASOLINE" }),
      gridFactor: null,
      pricePerGallon: { prices: { GASOLINE: "5000", DIESEL: null }, source: null },
      gwpSet: "AR6",
    });

    expect(result).toMatchObject({ kind: "ok", tonnes: 2, derivedGallons: 200 });
  });

  // Client feedback 2026-09-03 (E4): the popover has to divide by the same price the official
  // rollup will, or the estimate the user reads while typing disagrees with the stored total.
  it("divides a diesel subsidy by the diesel price, not the gasoline price", () => {
    const result = estimateSourceTonnes({
      values: ["1000000"],
      scope: "SCOPE_3",
      factor: factor({ co2Factor: "10", entryMode: "MONEY_PER_GALLON", fuelType: "DIESEL" }),
      gridFactor: null,
      pricePerGallon: {
        prices: { GASOLINE: "16046.315789", DIESEL: "9574.157895" },
        source: null,
      },
      gwpSet: "AR6",
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.derivedGallons).toBeCloseTo(1000000 / 9574.157895, 9);
    expect(result.tonnes).toBeCloseTo(((1000000 / 9574.157895) * 10) / 1000, 10);
  });

  it("reports missingTransportSubsidyPrice instead of computing zero", () => {
    const result = estimateSourceTonnes({
      values: ["1000000"],
      scope: "SCOPE_3",
      factor: factor({ co2Factor: "10", entryMode: "MONEY_PER_GALLON", fuelType: "GASOLINE" }),
      gridFactor: null,
      pricePerGallon: null,
      gwpSet: "AR6",
    });

    expect(result).toEqual({ kind: "missingTransportSubsidyPrice" });
  });

  it("reports missingTransportSubsidyPrice when only the other fuel has a price", () => {
    const result = estimateSourceTonnes({
      values: ["1000000"],
      scope: "SCOPE_3",
      factor: factor({ co2Factor: "10", entryMode: "MONEY_PER_GALLON", fuelType: "DIESEL" }),
      gridFactor: null,
      pricePerGallon: { prices: { GASOLINE: "16046.315789", DIESEL: null }, source: null },
      gwpSet: "AR6",
    });

    expect(result).toEqual({ kind: "missingTransportSubsidyPrice" });
  });
});

describe("estimateSourceTonnes: COUNT_TIMES_DISTANCE", () => {
  it("multiplies the count by the distance", () => {
    const result = estimateSourceTonnes({
      values: ["4"],
      secondaryValues: ["250"],
      scope: "SCOPE_3",
      factor: factor({ co2Factor: "0.1", entryMode: "COUNT_TIMES_DISTANCE" }),
      gridFactor: null,
      pricePerGallon: null,
      gwpSet: "AR6",
    });

    expect(result).toMatchObject({ kind: "ok", tonnes: 0.1, hasValues: true });
  });

  it("treats a missing distance as not-yet-reported, not a failure", () => {
    const result = estimateSourceTonnes({
      values: ["4"],
      secondaryValues: [""],
      scope: "SCOPE_3",
      factor: factor({ co2Factor: "0.1", entryMode: "COUNT_TIMES_DISTANCE" }),
      gridFactor: null,
      pricePerGallon: null,
      gwpSet: "AR6",
    });

    expect(result).toMatchObject({ kind: "ok", tonnes: 0, hasValues: false });
  });

  // Client feedback 2026-09-03 (E3): trip rows make N cells possible, and only then do "sum of
  // the products" and "product of the sums" disagree. Every source had exactly one cell before,
  // so no existing test could have caught this.
  it("adds the product of each trip, not the product of the sums", () => {
    const result = estimateSourceTonnes({
      values: ["4", "6"],
      secondaryValues: ["250", "100"],
      scope: "SCOPE_3",
      factor: factor({ co2Factor: "0.1", entryMode: "COUNT_TIMES_DISTANCE" }),
      gridFactor: null,
      pricePerGallon: null,
      gwpSet: "AR6",
    });

    // 4 x 250 plus 6 x 100 is 1.600 pasajeros*km, not (4 + 6) x (250 + 100) = 3.500.
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.tonnes).toBeCloseTo((4 * 250 + 6 * 100) * 0.1 * 0.001, 10);
  });

  it("pairs a missing secondary value as empty rather than reading past the end", () => {
    const result = estimateSourceTonnes({
      values: ["4", "6"],
      secondaryValues: ["250"],
      scope: "SCOPE_3",
      factor: factor({ co2Factor: "0.1", entryMode: "COUNT_TIMES_DISTANCE" }),
      gridFactor: null,
      pricePerGallon: null,
      gwpSet: "AR6",
    });

    // The second trip has no distance, so it contributes nothing; the first still counts.
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.tonnes).toBeCloseTo(4 * 250 * 0.1 * 0.001, 10);
  });

  it("still treats counts with no distance anywhere as not reported", () => {
    const result = estimateSourceTonnes({
      values: ["4", "6"],
      secondaryValues: [],
      scope: "SCOPE_3",
      factor: factor({ co2Factor: "0.1", entryMode: "COUNT_TIMES_DISTANCE" }),
      gridFactor: null,
      pricePerGallon: null,
      gwpSet: "AR6",
    });

    // Half an entry is unfinished, not a measured zero: the rule this mode has always applied.
    expect(result).toMatchObject({ kind: "ok", tonnes: 0, hasValues: false });
  });
});


// Client feedback 2026-09-03: "when applicable, show not only CO2 emission factor. Include all
// other gases even SF6, HFC, etc." The data-entry summary showed one number chosen by a fallback
// chain, so a diesel factor displayed only its CO2 term and a refrigerant displayed an anonymous
// CO2e figure with no gas named at all.
describe("listFactorGases", () => {
  const base: PreviewFactor = {
    co2Factor: null,
    ch4Factor: null,
    n2oFactor: null,
    co2eFactor: null,
    biogenic: false,
    factorUnit: null,
    source: null,
    entryMode: "QUANTITY",
  };

  it("lists every gas a per-gas factor carries, with a unit per gas", () => {
    expect(
      listFactorGases({
        ...base,
        co2Factor: "10.149",
        ch4Factor: "0.00001",
        n2oFactor: "0.000006",
        factorUnit: "kg CO2/gal",
      }),
    ).toEqual([
      { gas: "CO2", value: "10.149", unit: "kg CO2/gal" },
      { gas: "CH4", value: "0.00001", unit: "kg CH4/gal" },
      { gas: "N2O", value: "0.000006", unit: "kg N2O/gal" },
    ]);
  });

  it("omits a gas the factor does not have, rather than showing a zero", () => {
    const gases = listFactorGases({ ...base, co2Factor: "2", factorUnit: "kg CO2/kg" });
    expect(gases.map((g) => g.gas)).toEqual(["CO2"]);
  });

  it("names a pre-blended factor by its captured gas instead of an anonymous CO2e", () => {
    expect(
      listFactorGases({
        ...base,
        co2eFactor: "1960",
        gasType: "HFC",
        factorUnit: "kg CO2eq/kg",
      }),
    ).toEqual([{ gas: "HFC", value: "1960", unit: "kg CO2eq/kg" }]);
  });

  it("falls back to a neutral CO2e label when the library captured no gas", () => {
    expect(listFactorGases({ ...base, co2eFactor: "500", factorUnit: "kg CO2eq/USD" })).toEqual([
      { gas: "CO2e", value: "500", unit: "kg CO2eq/USD" },
    ]);
  });

  it("returns nothing for a factor with no readable value", () => {
    expect(listFactorGases(base)).toEqual([]);
  });
});
