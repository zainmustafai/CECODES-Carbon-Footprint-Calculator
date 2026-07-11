import { describe, expect, it } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  buildCreationDiff,
  buildFactorDiff,
  isEmptyDiff,
} from "../factor-diff";

// The diff is the audit trail. If it recorded a phantom change, every importer run would
// rewrite the whole library; if it missed a real one, the history would lie. The `before`
// values are built with Prisma.Decimal so the Decimal comparison path is genuinely exercised.

describe("buildFactorDiff", () => {
  it("ignores an unchanged Decimal written differently", () => {
    const diff = buildFactorDiff(
      { co2Factor: new Prisma.Decimal("10.100") },
      { co2Factor: "10.1" },
    );
    expect(isEmptyDiff(diff)).toBe(true);
  });

  it("detects a real Decimal change", () => {
    const diff = buildFactorDiff(
      { co2Factor: new Prisma.Decimal("10.1") },
      { co2Factor: "10.2" },
    );
    expect(diff.co2Factor).toEqual({ from: "10.1", to: "10.2" });
  });

  it("treats null and empty string as equal (both normalize to null)", () => {
    const diff = buildFactorDiff({ subcategory: null }, { subcategory: "" });
    expect(isEmptyDiff(diff)).toBe(true);
  });

  it("records a value set from null", () => {
    const diff = buildFactorDiff({ subcategory: null }, { subcategory: "Combustion" });
    expect(diff.subcategory).toEqual({ from: null, to: "Combustion" });
  });

  it("handles the boolean active in both directions", () => {
    expect(buildFactorDiff({ active: false }, { active: true }).active).toEqual({
      from: "false",
      to: "true",
    });
    expect(buildFactorDiff({ active: true }, { active: false }).active).toEqual({
      from: "true",
      to: "false",
    });
  });

  it("only reports fields present in the after object", () => {
    const diff = buildFactorDiff(
      { element: "Diesel", unit: "L" },
      { element: "Gasolina" },
    );
    expect(diff.element).toEqual({ from: "Diesel", to: "Gasolina" });
    expect("unit" in diff).toBe(false);
  });

  it("ignores a Decimal that did not actually move but changed representation", () => {
    const diff = buildFactorDiff(
      { uncertaintyPct: new Prisma.Decimal("5.0000") },
      { uncertaintyPct: "5" },
    );
    expect(isEmptyDiff(diff)).toBe(true);
  });
});

describe("buildCreationDiff", () => {
  it("omits nulls and includes every set field", () => {
    const diff = buildCreationDiff({
      scope: "SCOPE_1",
      element: "Diesel",
      subcategory: null,
      co2Factor: new Prisma.Decimal("2.68"),
      active: true,
    });
    expect(diff.scope).toEqual({ from: null, to: "SCOPE_1" });
    expect(diff.element).toEqual({ from: null, to: "Diesel" });
    expect(diff.co2Factor).toEqual({ from: null, to: "2.68" });
    expect(diff.active).toEqual({ from: null, to: "true" });
    expect("subcategory" in diff).toBe(false);
  });
});

describe("isEmptyDiff", () => {
  it("is true for an empty diff and false once a field is present", () => {
    expect(isEmptyDiff({})).toBe(true);
    expect(isEmptyDiff({ element: { from: "A", to: "B" } })).toBe(false);
  });
});
