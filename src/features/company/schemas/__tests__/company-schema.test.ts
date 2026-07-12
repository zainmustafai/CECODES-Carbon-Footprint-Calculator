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
});
