import { describe, expect, it } from "vitest";
import { deriveEntryMode } from "@/lib/factor-import/derive-modes";

// The rows here are the real ones from the official Emission Factors sheet. The two that matter
// most are the negatives: "km tubería" contains "km" but is a plain length, and an ordinary "gal"
// combustion row shares its unit with the transport subsidies.

describe("deriveEntryMode", () => {
  it("marks every distance unit in the official sheet", () => {
    for (const unit of ["pasajeros * km", "vehículo * km", "ton * km"]) {
      expect(deriveEntryMode({ unit, subcategory: null })).toBe("COUNT_TIMES_DISTANCE");
    }
  });

  it("leaves km tubería alone: it is a plain length, not a count times a distance", () => {
    expect(
      deriveEntryMode({ unit: "km tubería", subcategory: "Transporte y distribución" }),
    ).toBe("QUANTITY");
    expect(deriveEntryMode({ unit: "km tubería", subcategory: null })).toBe("QUANTITY");
  });

  it("marks a transport subsidy as money per gallon", () => {
    expect(deriveEntryMode({ unit: "gal", subcategory: "Subsidios de transporte" })).toBe(
      "MONEY_PER_GALLON",
    );
  });

  it("leaves an ordinary gallon fuel factor as a quantity", () => {
    expect(deriveEntryMode({ unit: "gal", subcategory: "Fuentes móviles" })).toBe("QUANTITY");
    expect(deriveEntryMode({ unit: "Gal", subcategory: null })).toBe("QUANTITY");
  });

  it("prefers the distance unit over the subsidy subcategory", () => {
    // Nothing in the sheet is both today. If a revision ever is, the two-field entry is the
    // safer reading: money per gallon has no second field to put the distance in.
    expect(
      deriveEntryMode({ unit: "pasajeros * km", subcategory: "Subsidios de transporte" }),
    ).toBe("COUNT_TIMES_DISTANCE");
  });
});
