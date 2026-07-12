import { z } from "zod";
import { isValidEntryValue } from "@/lib/decimal-input";
import { entryValue } from "./entry-schemas";

type T = (key: string) => string;

// A per-scope reduction target (Meta) in tonnes of CO2e, for one reporting year.
//
// It reuses `entryValue`, so it inherits the whole decimal contract: Colombian comma
// normalization, non-negative, at most 6 decimals, and "" transforming to null. A null
// target is not zero: it means the company has not set one, and the action deletes the row.
export const saveScopeTargetInput = z
  .object({
    reportingYearId: z.uuid(),
    scope: z.enum(["SCOPE_1", "SCOPE_2", "SCOPE_3"]),
    targetTonnes: entryValue,
  })
  .strict();

export function scopeTargetFormSchema(t: T) {
  return z.object({
    targetTonnes: z.string().refine(isValidEntryValue, t("format")),
  });
}

export type ScopeTargetFormValues = z.infer<ReturnType<typeof scopeTargetFormSchema>>;
