import { describe, expect, it } from "vitest";
import { DECIMAL_MONEY_INPUT, roundDecimalString } from "@/lib/decimal-input";

// roundDecimalString is the only hand-written decimal arithmetic in the app: everything else
// hands a string straight to Postgres. It exists so an admin can paste CECODES's own spreadsheet
// averages, which carry twelve decimals, into a DECIMAL(20,6) column instead of being told the
// number they were sent is invalid.

describe("DECIMAL_MONEY_INPUT", () => {
  it("accepts the client's own twelve-decimal average, which the old two-decimal rule refused", () => {
    expect(DECIMAL_MONEY_INPUT.test("16046.315789473685")).toBe(true);
    expect(DECIMAL_MONEY_INPUT.test("9574.157895")).toBe(true);
    expect(DECIMAL_MONEY_INPUT.test("11000")).toBe(true);
  });

  it("still refuses a sign, an exponent, or anything that is not a number", () => {
    for (const bad of ["-5", "1e400", "Infinity", "NaN", "abc", "", "1.2.3", "1,5"]) {
      expect(DECIMAL_MONEY_INPUT.test(bad), bad).toBe(false);
    }
  });

  it("still refuses more than 14 integer digits, which Postgres would reject as 22003", () => {
    expect(DECIMAL_MONEY_INPUT.test("99999999999999")).toBe(true);
    expect(DECIMAL_MONEY_INPUT.test("999999999999999")).toBe(false);
  });
});

describe("roundDecimalString", () => {
  it("fits the client's average to the column without going through a float", () => {
    expect(roundDecimalString("16046.315789473685", 6)).toBe("16046.315789");
    expect(roundDecimalString("9574.1578947368416", 6)).toBe("9574.157895");
    expect(roundDecimalString("15663.157894736842", 6)).toBe("15663.157895");
    expect(roundDecimalString("10646.473684210527", 6)).toBe("10646.473684");
  });

  it("leaves a value that already fits exactly as it was typed", () => {
    expect(roundDecimalString("11000", 6)).toBe("11000");
    expect(roundDecimalString("16046.31", 6)).toBe("16046.31");
    expect(roundDecimalString("1.123456", 6)).toBe("1.123456");
  });

  it("rounds half away from zero", () => {
    expect(roundDecimalString("1.0000004", 6)).toBe("1.000000");
    expect(roundDecimalString("1.0000005", 6)).toBe("1.000001");
  });

  it("carries across the decimal point instead of corrupting the integer part", () => {
    expect(roundDecimalString("9.9999995", 6)).toBe("10.000000");
    expect(roundDecimalString("0.9999999", 6)).toBe("1.000000");
    expect(roundDecimalString("99.9999999", 6)).toBe("100.000000");
  });

  it("handles a scale of zero", () => {
    expect(roundDecimalString("2.5", 0)).toBe("3");
    expect(roundDecimalString("2.4", 0)).toBe("2");
    expect(roundDecimalString("9.6", 0)).toBe("10");
  });

  it("keeps full precision on a 14-digit value, where a float round trip would not", () => {
    // Number("99999999999999.5") is 99999999999999.5 exactly, but Number("12345678901234.5678")
    // is not; string arithmetic does not care either way.
    expect(roundDecimalString("12345678901234.5678901", 6)).toBe("12345678901234.567890");
  });
});
