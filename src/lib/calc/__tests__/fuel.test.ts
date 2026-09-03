import { describe, expect, it } from "vitest";
import { deriveFuelType, gallonsFromMoney, priceForFuel, toFuelPrices } from "@/lib/calc/fuel";

// Client feedback 2026-09-03 (E4). Until now there was ONE transport-subsidy price per year and
// both C6 subsidy factors divided by it, so a diesel subsidy was silently charged the gasoline
// price. These are the four pieces that make the right price reach the right factor: the
// derivation that stamps the fuel onto the library row, the lookup, the fold from the year's
// rows, and the division itself.

describe("deriveFuelType", () => {
  it("names the two C6 subsidy elements from the client's workbook", () => {
    expect(
      deriveFuelType({
        entryMode: "MONEY_PER_GALLON",
        element: "C6: Gasolina E10 (Comercial) - Móvil",
      }),
    ).toBe("GASOLINE");
    expect(
      deriveFuelType({
        entryMode: "MONEY_PER_GALLON",
        element: "C6: Diésel B10 (Mezcla comercial) - Móvil",
      }),
    ).toBe("DIESEL");
  });

  it("matches an unaccented Diesel, because a workbook revision may drop the accent", () => {
    expect(
      deriveFuelType({ entryMode: "MONEY_PER_GALLON", element: "C6: Diesel B10 - Movil" }),
    ).toBe("DIESEL");
  });

  it("returns null for a factor that is not a money-per-gallon subsidy", () => {
    // "Gasolina" appears in plenty of ordinary Scope 1 fuel elements, which are priced per gallon
    // directly and must never be handed a subsidy price.
    expect(deriveFuelType({ entryMode: "QUANTITY", element: "C6: Gasolina E10" })).toBeNull();
  });

  it("returns null for a money-per-gallon factor naming neither fuel, rather than assuming", () => {
    expect(
      deriveFuelType({ entryMode: "MONEY_PER_GALLON", element: "C6: Gas natural vehicular" }),
    ).toBeNull();
  });
});

describe("priceForFuel", () => {
  const prices = { GASOLINE: "16046.315789", DIESEL: "9574.157895" };

  it("picks the price of the fuel the factor names", () => {
    expect(priceForFuel(prices, "DIESEL")).toBe("9574.157895");
    expect(priceForFuel(prices, "GASOLINE")).toBe("16046.315789");
  });

  it("returns null rather than guessing when the fuel is unknown", () => {
    expect(priceForFuel(prices, null)).toBeNull();
  });

  it("returns null when the year has no prices at all", () => {
    expect(priceForFuel(null, "DIESEL")).toBeNull();
  });

  it("returns null when only the other fuel has a price", () => {
    // The exact case the single-price table used to get wrong by substituting the other number.
    expect(priceForFuel({ GASOLINE: "16046", DIESEL: null }, "DIESEL")).toBeNull();
  });
});

describe("toFuelPrices", () => {
  it("leaves both slots null when the year has no rows", () => {
    expect(toFuelPrices([])).toEqual({ GASOLINE: null, DIESEL: null });
  });

  it("fills both slots as strings, never as numbers", () => {
    // Prisma hands back a Decimal, so the fold is fed objects that only promise toString(). The
    // twelve decimal places in the client's averages are exactly what Number() would blur.
    const prices = toFuelPrices([
      { fuel: "GASOLINE", pricePerGallonCop: { toString: () => "16046.315789" } },
      { fuel: "DIESEL", pricePerGallonCop: { toString: () => "9574.157895" } },
    ]);

    expect(prices).toEqual({ GASOLINE: "16046.315789", DIESEL: "9574.157895" });
    expect(typeof prices.GASOLINE).toBe("string");
  });
});

describe("gallonsFromMoney", () => {
  const prices = { GASOLINE: "16046.315789", DIESEL: "9574.157895" };

  it("divides the reported money by that fuel's own price", () => {
    expect(gallonsFromMoney(1_000_000, prices, "DIESEL")).toBeCloseTo(1_000_000 / 9574.157895, 9);
  });

  it("returns null for a price of zero instead of Infinity", () => {
    // The admin form accepts "0". Dividing by it would put Infinity into a year's total with
    // nothing flagged; the null makes the caller disclose a missing price instead.
    const gallons = gallonsFromMoney(1_000_000, { GASOLINE: "0", DIESEL: null }, "GASOLINE");
    expect(gallons).toBeNull();
  });

  it("returns null when the fuel has no price, rather than falling back to the other one", () => {
    expect(gallonsFromMoney(1_000_000, { GASOLINE: "16046", DIESEL: null }, "DIESEL")).toBeNull();
    expect(gallonsFromMoney(1_000_000, null, "DIESEL")).toBeNull();
    expect(gallonsFromMoney(1_000_000, prices, null)).toBeNull();
  });
});
