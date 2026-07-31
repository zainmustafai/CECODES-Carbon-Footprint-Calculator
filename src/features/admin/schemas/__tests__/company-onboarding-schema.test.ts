import { describe, expect, it } from "vitest";
import { companyOnboardingSchema } from "../company-onboarding-schema";

const t = (key: string) => key;
const schema = companyOnboardingSchema(t);

const base = {
  companyName: "Mia",
  sector: "",
  contactEmail: "",
  facilityName: "",
  facilityLocation: "",
  year: "",
  userEmail: "",
  userPassword: "",
};

function issuesOn(value: typeof base, path: string): string[] {
  const result = schema.safeParse(value);
  if (result.success) return [];
  return result.error.issues
    .filter((issue) => issue.path[0] === path)
    .map((issue) => issue.message);
}

describe("companyOnboardingSchema", () => {
  it("passes with only a company name: sector and every other step are optional", () => {
    expect(schema.safeParse(base).success).toBe(true);
  });

  it("validates contactEmail only when present", () => {
    expect(issuesOn({ ...base, contactEmail: "nope" }, "contactEmail")).toEqual([
      "contactEmailInvalid",
    ]);
    expect(schema.safeParse({ ...base, contactEmail: "sos@empresa.com" }).success).toBe(true);
  });

  it("keeps the sede all-or-nothing pairing", () => {
    expect(issuesOn({ ...base, facilityName: "Planta" }, "facilityLocation")).toEqual([
      "facilityLocationRequired",
    ]);
    expect(issuesOn({ ...base, facilityLocation: "Cali" }, "facilityName")).toEqual([
      "facilityNameRequired",
    ]);
  });

  it("refuses a year without a sede", () => {
    expect(issuesOn({ ...base, year: "2024" }, "year")).toEqual(["yearRequiresFacility"]);
  });

  it("bounds the year once a sede exists", () => {
    const withFacility = { ...base, facilityName: "Planta", facilityLocation: "Cali" };
    expect(schema.safeParse({ ...withFacility, year: "" }).success).toBe(true);
    expect(schema.safeParse({ ...withFacility, year: "2024" }).success).toBe(true);
    expect(issuesOn({ ...withFacility, year: "abc" }, "year")).toEqual(["yearInvalid"]);
    expect(issuesOn({ ...withFacility, year: "1999" }, "year")).toEqual(["yearMin"]);
    const tooFar = String(new Date().getFullYear() + 2);
    expect(issuesOn({ ...withFacility, year: tooFar }, "year")).toEqual(["yearMax"]);
    const nextYear = String(new Date().getFullYear() + 1);
    expect(schema.safeParse({ ...withFacility, year: nextYear }).success).toBe(true);
  });

  it("keeps the user email/password pairing rules", () => {
    expect(issuesOn({ ...base, userEmail: "nope" }, "userEmail")).toEqual(["emailInvalid"]);
    expect(issuesOn({ ...base, userEmail: "a@b.co" }, "userPassword")).toEqual(["passwordMin"]);
    expect(issuesOn({ ...base, userPassword: "supersecret" }, "userEmail")).toEqual([
      "emailRequired",
    ]);
    expect(
      schema.safeParse({ ...base, userEmail: "a@b.co", userPassword: "supersecret" }).success,
    ).toBe(true);
  });
});
