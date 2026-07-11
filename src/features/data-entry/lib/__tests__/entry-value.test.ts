import { describe, expect, it } from "vitest";
import {
  entryValue,
  isValidEntryValue,
  normalizeDecimalInput,
} from "../../schemas/entry-schemas";

// The old prototype stored whole numbers. Nothing below is allowed to become a JS number.
describe("entry value validation", () => {
  it("accepts non-negative decimals up to 6 places", () => {
    for (const value of ["0", "12", "12.5", "1.234567", "0.000001"]) {
      expect(isValidEntryValue(value)).toBe(true);
    }
  });

  it("accepts an empty value, which means not reported", () => {
    expect(isValidEntryValue("")).toBe(true);
    expect(entryValue.parse("")).toBeNull();
  });

  it("rejects a 7th decimal place, which Postgres would silently round", () => {
    expect(isValidEntryValue("1.2345678")).toBe(false);
  });

  it("rejects more than 14 integer digits, which Decimal(20,6) cannot hold", () => {
    expect(isValidEntryValue("99999999999999.999999")).toBe(true); // 14 digits
    expect(isValidEntryValue("100000000000000")).toBe(false); // 15 digits
  });

  it("rejects negatives, exponents and non-numbers", () => {
    for (const value of ["-5", "-0.1", "1e400", "1e5", "Infinity", "NaN", "abc", "1 2 3x"]) {
      expect(isValidEntryValue(value)).toBe(false);
    }
  });

  it("normalizes the Colombian decimal comma and stray spaces", () => {
    expect(normalizeDecimalInput("1 234,56")).toBe("1234.56");
    expect(normalizeDecimalInput(" 12,5 ")).toBe("12.5");
    expect(isValidEntryValue("12,5")).toBe(true);
  });

  it("strips unambiguous dot-grouped thousands (the es-CO paste format)", () => {
    // A comma marks the dots as grouping beyond doubt.
    expect(normalizeDecimalInput("1.234,56")).toBe("1234.56");
    expect(normalizeDecimalInput("1.234.567,89")).toBe("1234567.89");
    // More than one dot can only be grouping: a decimal has a single point.
    expect(normalizeDecimalInput("1.234.567")).toBe("1234567");
    expect(isValidEntryValue("1.234.567,89")).toBe(true);
  });

  it("leaves a single bare dot alone: '12.345' stays a decimal, never twelve thousand", () => {
    // Rewriting it would silently change the meaning of input this field always accepted.
    // The visible field error and the live estimate are the guard for the ambiguous case.
    expect(normalizeDecimalInput("12.345")).toBe("12.345");
    // Groups must be exactly three digits: "12.34" is not a thousands pattern.
    expect(normalizeDecimalInput("12.34,5")).toBe("12.34.5");
    expect(isValidEntryValue("12.34,5")).toBe(false);
  });

  it("returns a string, never a number, so precision survives", () => {
    const parsed = entryValue.parse("99999999999999.999999");
    expect(parsed).toBe("99999999999999.999999");
    expect(typeof parsed).toBe("string");
    // The same value through a float would lose its tail entirely.
    expect(String(Number("99999999999999.999999"))).not.toBe("99999999999999.999999");
  });

  it("keeps 0 distinct from not reported", () => {
    expect(entryValue.parse("0")).toBe("0");
    expect(entryValue.parse("")).toBeNull();
  });
});
