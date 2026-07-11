import { z } from "zod";
import {
  DECIMAL_20_6,
  isValidEntryValue,
  normalizeDecimalInput,
} from "@/lib/decimal-input";

type T = (key: string) => string;

// The decimal rules moved to @/lib/decimal-input once the admin factor forms needed the
// same normalization against a wider column type. Re-exported so existing imports and the
// unit tests in lib/__tests__ keep pointing here.
export { DECIMAL_20_6, isValidEntryValue, normalizeDecimalInput };

// "" means "not reported", which is stored as NULL. It is not the same as 0, which means
// the company genuinely consumed nothing.
export const entryValue = z
  .string()
  .transform(normalizeDecimalInput)
  .refine(isValidEntryValue)
  .transform((value): string | null => (value === "" ? null : value));

export const saveEntryValuesInput = z
  .object({
    reportingYearId: z.uuid(),
    values: z
      .array(z.object({ entryId: z.uuid(), value: entryValue }).strict())
      .min(1)
      .max(64), // one Scope-2 grid is 12; a generous ceiling on a single batch
  })
  .strict();

export const addSourceInput = z
  .object({
    reportingYearId: z.uuid(),
    emissionFactorId: z.uuid(),
  })
  .strict();

export const removeSourceInput = addSourceInput;
export const copyJanuaryInput = addSourceInput;

export const setCategoryAppliesInput = z
  .object({
    reportingYearId: z.uuid(),
    scope: z.enum(["SCOPE_1", "SCOPE_2", "SCOPE_3"]),
    category: z.string().trim().min(1).max(200),
    applies: z.boolean(),
  })
  .strict();

// Client-side field schema, translated. The server re-validates with the schemas above and
// never trusts this resolver.
export function entryValueFieldSchema(t: T) {
  return z.object({
    value: z.string().refine(isValidEntryValue, t("valueFormat")),
  });
}
