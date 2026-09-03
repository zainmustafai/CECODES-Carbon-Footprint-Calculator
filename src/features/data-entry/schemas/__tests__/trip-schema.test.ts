import { describe, expect, it } from "vitest";
import { saveTransportTripsInput } from "../trip-schemas";

const base = {
  reportingYearId: "3f1a5b8c-0000-4000-8000-000000000001",
  entryId: "3f1a5b8c-0000-4000-8000-000000000002",
};

describe("saveTransportTripsInput", () => {
  it("accepts Colombian decimals and trims the text fields", () => {
    const parsed = saveTransportTripsInput.safeParse({
      ...base,
      trips: [{ reference: "  Bogotá a Cali  ", count: "4", distanceKm: "1240,5", note: "" }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.trips[0].distanceKm).toBe("1240.5");
    expect(parsed.data.trips[0].reference).toBe("Bogotá a Cali");
    expect(parsed.data.trips[0].note).toBeNull();
  });

  it("accepts an empty list, which clears the source", () => {
    expect(saveTransportTripsInput.safeParse({ ...base, trips: [] }).success).toBe(true);
  });

  it("refuses a negative distance and a non-numeric count", () => {
    expect(
      saveTransportTripsInput.safeParse({
        ...base,
        trips: [{ reference: "", count: "4", distanceKm: "-3", note: "" }],
      }).success,
    ).toBe(false);
    expect(
      saveTransportTripsInput.safeParse({
        ...base,
        trips: [{ reference: "", count: "abc", distanceKm: "3", note: "" }],
      }).success,
    ).toBe(false);
  });

  it("refuses a blank count: a trip row has no 'not reported' state", () => {
    expect(
      saveTransportTripsInput.safeParse({
        ...base,
        trips: [{ reference: "", count: "", distanceKm: "3", note: "" }],
      }).success,
    ).toBe(false);
  });

  it("caps the batch and refuses an unexpected key", () => {
    const trip = { reference: "", count: "1", distanceKm: "1", note: "" };
    expect(
      saveTransportTripsInput.safeParse({ ...base, trips: Array(201).fill(trip) }).success,
    ).toBe(false);
    expect(
      saveTransportTripsInput.safeParse({ ...base, trips: [{ ...trip, extra: 1 }] }).success,
    ).toBe(false);
  });
});
