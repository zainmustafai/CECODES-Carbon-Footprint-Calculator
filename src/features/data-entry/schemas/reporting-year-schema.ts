import { z } from "zod";

type T = (key: string) => string;

// STILL 2000, DELIBERATELY, though CECODES confirmed (2026-07-17) the tool is never used before
// 2025: "First year register will be filled for 2025." Requirements §12.A5 and §12.A9.
//
// The floor cannot be raised until CECODES supplies the 2025 grid electricity factor, because
// raising it makes Scope 2 uncomputable for EVERY year a user could create:
//
//     legal years under a 2025 floor : 2025, 2026, 2027   (maxReportingYear is now+1)
//     grid factors on file           : 2013, 2019, 2021, 2022, 2023, 2024
//     intersection                   : none
//
// Their workbook stops at 2024 on both sheets, so the value does not exist to seed and inventing
// one is the silent-wrong-number failure this codebase exists to avoid. Today a company can at
// least report 2024 against a real factor; a 2025 floor removes that without providing a
// replacement, which is strictly worse than the status quo it was meant to improve.
//
// Raise to 2025 in this one line the day the 2025 factor lands (round-2 memo item 1). That change
// also rewrites e2e/fixture.ts: E2E_YEAR is 2024 and several specs create it through the UI form,
// so they fail against a 2025 floor. E2E_YEAR_WITHOUT_GRID_FACTOR (2020) needs rethinking too,
// since under a 2025 floor every legal year lacks a factor and the distinction it tests collapses.
export const MIN_REPORTING_YEAR = 2000;
export function maxReportingYear(now = new Date()): number {
  return now.getFullYear() + 1;
}

export const createReportingYearInput = z
  .object({
    facilityId: z.uuid(),
    year: z.number().int().gte(MIN_REPORTING_YEAR),
  })
  .strict()
  .refine((v) => v.year <= maxReportingYear());

// A reporting year is never renamed. Its number is its identity: gwpSet is pinned from it at
// creation, the Scope 2 grid factor is looked up by it, and [facilityId, year] is unique.
// Renaming 2021 to 2022 would silently swap AR5 for AR6 under data already entered. Deleting
// and recreating is the honest flow, and it is two clicks on the facilities card.
export const deleteReportingYearInput = z.object({ reportingYearId: z.uuid() }).strict();

// The field registers with valueAsNumber, so an empty box arrives as NaN rather than "".
export function reportingYearFormSchema(t: T) {
  return z.object({
    year: z
      .number({ message: t("yearInvalid") })
      .int(t("yearInvalid"))
      .gte(MIN_REPORTING_YEAR, t("yearMin"))
      .lte(maxReportingYear(), t("yearMax")),
  });
}

export type ReportingYearFormValues = z.infer<ReturnType<typeof reportingYearFormSchema>>;
