import { describe, expect, it } from "vitest";
import {
  MIN_REPORTING_YEAR,
  createReportingYearInput,
  maxReportingYear,
  reportingYearFormSchema,
} from "../reporting-year-schema";

const FACILITY_ID = "11111111-1111-4111-8111-111111111111";

function parseInput(year: number) {
  return createReportingYearInput.safeParse({ facilityId: FACILITY_ID, year });
}

// The form factory takes a translator. Echo the key so a failure names the rule that rejected.
const t = (key: string) => key;

describe("MIN_REPORTING_YEAR", () => {
  // CECODES confirmed on 2026-07-17 that 2025 is the first reporting year, so this floor looks
  // wrong. It is not: raising it is blocked on their 2025 grid electricity factor, which does not
  // exist in their workbook or ours. See the note on the constant, and round-2 memo item 1.
  //
  // This test exists to make the coupling explicit rather than to bless 2000. If someone raises
  // the floor to 2025 without landing a 2025 grid factor, this fails and says why: no year a user
  // can create would be able to compute Scope 2.
  it("still admits a year that has a grid factor on file, so Scope 2 is computable somewhere", () => {
    const yearsWithGridFactors = [2013, 2019, 2021, 2022, 2023, 2024];
    const creatable = yearsWithGridFactors.filter(
      (y) => y >= MIN_REPORTING_YEAR && y <= maxReportingYear(),
    );
    expect(creatable.length).toBeGreaterThan(0);
  });
});

describe("createReportingYearInput", () => {
  it("accepts next year, so a company can open its books early", () => {
    expect(parseInput(maxReportingYear()).success).toBe(true);
  });

  it("rejects two years out", () => {
    expect(parseInput(maxReportingYear() + 1).success).toBe(false);
  });

  it("rejects a year below the floor", () => {
    expect(parseInput(MIN_REPORTING_YEAR - 1).success).toBe(false);
  });

  it("rejects a non-integer year", () => {
    expect(parseInput(2025.5).success).toBe(false);
  });

  // The action is a public POST endpoint, so the schema is .strict() and must reject anything the
  // UI did not send rather than trusting it.
  it("rejects unknown keys", () => {
    const result = createReportingYearInput.safeParse({
      facilityId: FACILITY_ID,
      year: 2025,
      companyId: "22222222-2222-4222-8222-222222222222",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a facilityId that is not a uuid", () => {
    expect(
      createReportingYearInput.safeParse({ facilityId: "not-a-uuid", year: 2025 }).success,
    ).toBe(false);
  });
});

describe("reportingYearFormSchema", () => {
  it("reports an empty box as an invalid year, not as a bounds failure", () => {
    // The field registers with valueAsNumber, so an empty box arrives as NaN rather than "".
    const result = reportingYearFormSchema(t).safeParse({ year: Number.NaN });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("yearInvalid");
  });

  it("names the bound it failed, so the form can localize each case", () => {
    const tooEarly = reportingYearFormSchema(t).safeParse({ year: MIN_REPORTING_YEAR - 1 });
    expect(tooEarly.success).toBe(false);
    if (!tooEarly.success) expect(tooEarly.error.issues[0].message).toBe("yearMin");

    const tooLate = reportingYearFormSchema(t).safeParse({ year: maxReportingYear() + 1 });
    expect(tooLate.success).toBe(false);
    if (!tooLate.success) expect(tooLate.error.issues[0].message).toBe("yearMax");
  });
});
