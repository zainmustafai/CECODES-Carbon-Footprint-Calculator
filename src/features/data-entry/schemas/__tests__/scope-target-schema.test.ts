import { describe, expect, it } from "vitest";
import { saveScopeTargetInput } from "../scope-target-schema";

const base = {
  reportingYearId: "11111111-1111-4111-8111-111111111111",
  scope: "SCOPE_1" as const,
};

function parse(targetTonnes: string) {
  return saveScopeTargetInput.safeParse({ ...base, targetTonnes });
}

describe("saveScopeTargetInput", () => {
  it("accepts a plain decimal", () => {
    const result = parse("140.5");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.targetTonnes).toBe("140.5");
  });

  it("normalizes the Colombian decimal comma", () => {
    const result = parse("140,5");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.targetTonnes).toBe("140.5");
  });

  it("treats an empty string as 'clear the target', not as zero", () => {
    const result = parse("");
    expect(result.success).toBe(true);
    // null tells the action to delete the row. A target of 0 is a different, legitimate value.
    if (result.success) expect(result.data.targetTonnes).toBeNull();
  });

  it("keeps an explicit zero", () => {
    const result = parse("0");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.targetTonnes).toBe("0");
  });

  it("rejects a negative target", () => {
    expect(parse("-5").success).toBe(false);
  });

  it("rejects more than six decimal places", () => {
    expect(parse("1.1234567").success).toBe(false);
    expect(parse("1.123456").success).toBe(true);
  });

  it("rejects exponents, infinities and text", () => {
    expect(parse("1e400").success).toBe(false);
    expect(parse("Infinity").success).toBe(false);
    expect(parse("abc").success).toBe(false);
  });

  it("rejects an unknown scope and a non-uuid reporting year", () => {
    expect(
      saveScopeTargetInput.safeParse({ ...base, scope: "SCOPE_4", targetTonnes: "1" })
        .success,
    ).toBe(false);
    expect(
      saveScopeTargetInput.safeParse({
        reportingYearId: "not-a-uuid",
        scope: "SCOPE_1",
        targetTonnes: "1",
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown key, so nothing can ride into the data object", () => {
    const result = saveScopeTargetInput.safeParse({
      ...base,
      targetTonnes: "1",
      companyId: "someone-elses-company",
    });
    expect(result.success).toBe(false);
  });
});
