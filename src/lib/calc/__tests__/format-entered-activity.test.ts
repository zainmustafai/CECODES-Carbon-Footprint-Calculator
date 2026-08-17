import { describe, expect, it } from "vitest";
import { formatEnteredActivity } from "../format-entered-activity";

// Regression coverage for the 2026-08-15 audit finding: Preview/PDF/Excel showed the raw stored
// value next to the factor's own unit for entry modes that reinterpret what was entered (a COP
// amount labeled "gal"; a passenger/vehicle count labeled "pasajeros * km" with the distance
// silently dropped). This file is display-only - it never computes a tonnes figure, so there is
// nothing here that could regress the calculation itself.
describe("formatEnteredActivity", () => {
  it("passes a QUANTITY entry through unchanged", () => {
    const result = formatEnteredActivity({
      entryMode: "QUANTITY",
      value: 100,
      secondaryValue: null,
      unit: "Gal",
    });
    expect(result).toEqual({ value: 100, unit: "Gal", secondaryValue: null, secondaryUnit: null });
  });

  it("relabels a MONEY_PER_GALLON entry's unit as COP, keeping the entered value unchanged", () => {
    const result = formatEnteredActivity({
      entryMode: "MONEY_PER_GALLON",
      value: 3_527_280,
      secondaryValue: null,
      unit: "gal", // the factor's own unit - what the engine derives, not what was entered
      });
    expect(result).toEqual({
      value: 3_527_280,
      unit: "COP",
      secondaryValue: null,
      secondaryUnit: null,
    });
  });

  it("splits a COUNT_TIMES_DISTANCE entry's combined unit and surfaces the second number", () => {
    const result = formatEnteredActivity({
      entryMode: "COUNT_TIMES_DISTANCE",
      value: 5600,
      secondaryValue: 1,
      unit: "pasajeros * km",
    });
    expect(result).toEqual({ value: 5600, unit: "pasajeros", secondaryValue: 1, secondaryUnit: "km" });
  });

  it("splits a vehículo * km unit the same way", () => {
    const result = formatEnteredActivity({
      entryMode: "COUNT_TIMES_DISTANCE",
      value: 3,
      secondaryValue: 120,
      unit: "vehículo * km",
    });
    expect(result).toEqual({ value: 3, unit: "vehículo", secondaryValue: 120, secondaryUnit: "km" });
  });

  it("falls back to the raw unit and 'km' if a COUNT_TIMES_DISTANCE unit is ever malformed", () => {
    const result = formatEnteredActivity({
      entryMode: "COUNT_TIMES_DISTANCE",
      value: 3,
      secondaryValue: 120,
      unit: "vehículos", // missing " * km" - should never happen in the live library, but must not throw
    });
    expect(result).toEqual({ value: 3, unit: "vehículos", secondaryValue: 120, secondaryUnit: "km" });
  });

  it("passes null values through for a not-yet-reported entry", () => {
    const result = formatEnteredActivity({
      entryMode: "MONEY_PER_GALLON",
      value: null,
      secondaryValue: null,
      unit: "gal",
    });
    expect(result).toEqual({ value: null, unit: "COP", secondaryValue: null, secondaryUnit: null });
  });
});
