import { z } from "zod";
import { normalizeDecimalInput } from "@/lib/decimal-input";

type T = (key: string) => string;

// A percentage: at most 2 fractional digits (matches Decimal(5,2)), strictly between 0 and 100.
// 0 would mean "no reduction", which is not a goal; over 100% is not meaningful for a
// company-wide TOTAL reduction. "" clears the target (deletes the row) rather than saving 0 -
// an unset target is not the same as "reduce by nothing."
const PERCENT = /^\d{1,3}(\.\d{1,2})?$/;

export function isValidReductionPct(raw: string): boolean {
  const normalized = normalizeDecimalInput(raw);
  if (normalized === "") return true;
  if (!PERCENT.test(normalized)) return false;
  const value = Number(normalized);
  return value > 0 && value <= 100;
}

export const saveCompanyTargetInput = z
  .object({
    companyId: z.uuid(),
    reductionPct: z
      .string()
      .transform(normalizeDecimalInput)
      .refine((value) => value === "" || (PERCENT.test(value) && Number(value) > 0 && Number(value) <= 100))
      .transform((value): string | null => (value === "" ? null : value)),
  })
  .strict();

export function companyTargetFormSchema(t: T) {
  return z.object({
    reductionPct: z.string().refine(isValidReductionPct, t("format")),
  });
}

export type CompanyTargetFormValues = z.infer<ReturnType<typeof companyTargetFormSchema>>;
