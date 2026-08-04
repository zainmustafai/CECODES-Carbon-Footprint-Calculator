import { describe, expect, it } from "vitest";
import { saveCompanyTargetInput } from "../company-target-schema";

const base = { companyId: "11111111-1111-4111-8111-111111111111" };

function parse(reductionPct: string) {
  return saveCompanyTargetInput.safeParse({ ...base, reductionPct });
}

describe("saveCompanyTargetInput", () => {
  it("accepts a plain percentage", () => {
    const result = parse("5.5");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.reductionPct).toBe("5.5");
  });

  it("normalizes the Colombian decimal comma", () => {
    const result = parse("5,5");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.reductionPct).toBe("5.5");
  });

  it("treats an empty string as 'clear the target', not as zero", () => {
    const result = parse("");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.reductionPct).toBeNull();
  });

  it("rejects zero: no reduction is not a goal", () => {
    expect(parse("0").success).toBe(false);
  });

  it("accepts exactly 100 and rejects anything above it", () => {
    expect(parse("100").success).toBe(true);
    expect(parse("100.01").success).toBe(false);
    expect(parse("101").success).toBe(false);
  });

  it("rejects a negative percentage", () => {
    expect(parse("-5").success).toBe(false);
  });

  it("rejects more than two decimal places", () => {
    expect(parse("5.123").success).toBe(false);
    expect(parse("5.12").success).toBe(true);
  });

  it("rejects exponents, infinities and text", () => {
    expect(parse("1e400").success).toBe(false);
    expect(parse("Infinity").success).toBe(false);
    expect(parse("abc").success).toBe(false);
  });

  it("rejects a non-uuid companyId", () => {
    expect(
      saveCompanyTargetInput.safeParse({ companyId: "not-a-uuid", reductionPct: "5" }).success,
    ).toBe(false);
  });

  it("rejects an unknown key, so nothing can ride into the data object", () => {
    const result = saveCompanyTargetInput.safeParse({
      ...base,
      reductionPct: "5",
      companyIdOverride: "someone-elses-company",
    });
    expect(result.success).toBe(false);
  });
});
