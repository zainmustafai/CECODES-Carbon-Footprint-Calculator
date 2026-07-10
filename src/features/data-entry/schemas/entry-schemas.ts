import { z } from "zod";

type T = (key: string) => string;

// Decimal(20, 6): at most 14 integer digits and 6 fractional digits, non-negative.
// Postgres silently rounds a 7th decimal but raises 22003 past 14 integer digits, so both
// are caught here rather than at the driver. No sign, no exponent: this rejects "-5",
// "1e400", "Infinity", "NaN" and "abc" by construction.
export const DECIMAL_20_6 = /^\d{1,14}(\.\d{1,6})?$/;

// Colombian keyboards produce a decimal comma. Thin/regular spaces come from pasted values.
export function normalizeDecimalInput(raw: string): string {
  return raw.replace(/[\s ]/g, "").replace(",", ".");
}

export function isValidEntryValue(raw: string): boolean {
  const normalized = normalizeDecimalInput(raw);
  return normalized === "" || DECIMAL_20_6.test(normalized);
}

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
