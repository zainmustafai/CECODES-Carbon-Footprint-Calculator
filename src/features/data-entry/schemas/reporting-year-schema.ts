import { z } from "zod";

type T = (key: string) => string;

// The oldest grid electricity factor CECODES supplied is 2013. Allow next year so a company
// can open its books early.
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
