import { describe, expect, it } from "vitest";
import { updateCompanyProfileInput } from "../company-schema";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";

function parse(input: Record<string, unknown>) {
  return updateCompanyProfileInput.safeParse({ companyId: COMPANY_ID, ...input });
}

describe("updateCompanyProfileInput", () => {
  it("accepts a name alone", () => {
    expect(parse({ name: "Alimentos del Valle S.A.S." }).success).toBe(true);
  });

  it("trims the name and rejects an empty one", () => {
    const result = parse({ name: "  Acme  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Acme");

    expect(parse({ name: "   " }).success).toBe(false);
  });

  it("accepts an empty contact email, which means 'not set'", () => {
    expect(parse({ name: "Acme", contactEmail: "" }).success).toBe(true);
  });

  it("accepts a valid contact email and rejects a malformed one", () => {
    expect(parse({ name: "Acme", contactEmail: "a@b.co" }).success).toBe(true);
    expect(parse({ name: "Acme", contactEmail: "not-an-email" }).success).toBe(false);
  });

  it("rejects a non-uuid companyId", () => {
    expect(
      updateCompanyProfileInput.safeParse({ companyId: "1", name: "Acme" }).success,
    ).toBe(false);
  });

  it("rejects an unknown key", () => {
    // .strict() is what stops an unknown field riding into a Prisma `data` object.
    expect(parse({ name: "Acme", active: false }).success).toBe(false);
  });

  it("accepts the six profile fields the report header prints", () => {
    const result = parse({
      name: "Acme",
      sector: "manufactura",
      contactEmail: "",
      nit: "  900123456-7  ",
      employeeCount: "240",
      contactName: "Ana Gomez",
      contactRole: "Gerente HSEQ",
      contactPhone: "+57 300 000 0000",
      website: "https://acme.co",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.nit).toBe("900123456-7");
    expect(result.data.employeeCount).toBe(240);
    expect(result.data.contactName).toBe("Ana Gomez");
    expect(result.data.website).toBe("https://acme.co");
  });

  it("stores an untouched profile field as null, never as an empty string", () => {
    // The report header tests these with plain truthiness, so a stored "" renders nothing
    // while leaving a dirty row behind.
    const result = parse({
      name: "Acme",
      sector: "",
      contactEmail: "",
      nit: "",
      employeeCount: "",
      contactName: "",
      contactRole: "",
      contactPhone: "",
      website: "",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.nit).toBeNull();
    expect(result.data.employeeCount).toBeNull();
    expect(result.data.contactName).toBeNull();
    expect(result.data.contactRole).toBeNull();
    expect(result.data.contactPhone).toBeNull();
    expect(result.data.website).toBeNull();
  });

  it("rejects a negative or non-numeric employeeCount", () => {
    expect(parse({ name: "Acme", employeeCount: "-1" }).success).toBe(false);
    expect(parse({ name: "Acme", employeeCount: "abc" }).success).toBe(false);
    expect(parse({ name: "Acme", employeeCount: "12.5" }).success).toBe(false);
  });

  it("rejects a profile field longer than its column", () => {
    expect(parse({ name: "Acme", nit: "9".repeat(51) }).success).toBe(false);
    expect(parse({ name: "Acme", contactPhone: "3".repeat(41) }).success).toBe(false);
  });

  it("still refuses an unexpected key alongside the profile fields", () => {
    expect(
      parse({
        name: "Acme",
        nit: "900123456-7",
        employeeCount: "240",
        contactName: "Ana Gomez",
        contactRole: "Gerente HSEQ",
        contactPhone: "+57 300 000 0000",
        website: "https://acme.co",
        active: false,
      }).success,
    ).toBe(false);
  });
});
