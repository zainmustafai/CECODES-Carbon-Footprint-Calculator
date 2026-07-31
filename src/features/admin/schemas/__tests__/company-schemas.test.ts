import { describe, expect, it } from "vitest";
import { createCompanyInput, updateCompanyInput } from "../company-schemas";

describe("createCompanyInput", () => {
  it("accepts an omitted, empty, or valid contactEmail", () => {
    expect(createCompanyInput.safeParse({ name: "Mia" }).success).toBe(true);
    expect(createCompanyInput.safeParse({ name: "Mia", contactEmail: "" }).success).toBe(true);
    expect(
      createCompanyInput.safeParse({ name: "Mia", contactEmail: "sos@empresa.com" }).success,
    ).toBe(true);
  });

  it("rejects a malformed contactEmail", () => {
    expect(createCompanyInput.safeParse({ name: "Mia", contactEmail: "nope" }).success).toBe(
      false,
    );
  });

  it("rejects unknown keys through .strict()", () => {
    expect(createCompanyInput.safeParse({ name: "Mia", active: false }).success).toBe(false);
  });
});

describe("updateCompanyInput", () => {
  it("REJECTS contactEmail: the edit contract must not widen with the create one", () => {
    const result = updateCompanyInput.safeParse({
      companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Mia",
      contactEmail: "sos@empresa.com",
    });
    expect(result.success).toBe(false);
  });

  it("still accepts its own shape", () => {
    const result = updateCompanyInput.safeParse({
      companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Mia",
      sector: "energia",
    });
    expect(result.success).toBe(true);
  });
});
