import { z } from "zod";
import { isValidEntryValue, normalizeDecimalInput } from "@/lib/decimal-input";

type T = (key: string) => string;

// "Datos sobre tecnologías más limpias y buenas prácticas" (CECODES, 2026-07-24). The section
// is deliberately OPEN: every descriptive field is free text and optional except the element
// (what is being reported). The quantity follows the same decimal rules as activity data, but
// it never reaches the calculation engine.

const SCOPES = ["SCOPE_1", "SCOPE_2", "SCOPE_3"] as const;

const freeText = z
  .string()
  .trim()
  .max(300)
  .transform((value) => (value === "" ? null : value));

// The quantity as the server stores it: a normalized Decimal string, or null when the company
// reports a practice without a number. Same normalization as every numeric input in the app.
const quantityInput = z
  .string()
  .trim()
  .max(40)
  .transform((value) => normalizeDecimalInput(value))
  .refine((value) => value === "" || isValidEntryValue(value))
  .transform((value) => (value === "" ? null : value));

export const addCleanTechInput = z
  .object({
    reportingYearId: z.uuid(),
    scope: z.enum(SCOPES).nullable(),
    category: freeText,
    subcategory: freeText,
    element: z.string().trim().min(1).max(300),
    quantity: quantityInput,
    unit: freeText,
  })
  .strict();

export const updateCleanTechInput = addCleanTechInput.extend({ id: z.uuid() }).strict();

export const removeCleanTechInput = z
  .object({ id: z.uuid(), reportingYearId: z.uuid() })
  .strict();

export type AddCleanTechInput = z.infer<typeof addCleanTechInput>;

// The client-side form. Messages localize through the translator, like every form schema here.
export function cleanTechFormSchema(t: T) {
  return z.object({
    scope: z.enum([...SCOPES, ""] as const),
    category: z.string().trim().max(300, t("tooLong")),
    subcategory: z.string().trim().max(300, t("tooLong")),
    element: z.string().trim().min(1, t("elementRequired")).max(300, t("tooLong")),
    quantity: z
      .string()
      .trim()
      .max(40, t("quantityInvalid"))
      .refine((value) => isValidEntryValue(value), t("quantityInvalid")),
    unit: z.string().trim().max(300, t("tooLong")),
  });
}

export type CleanTechFormValues = z.infer<ReturnType<typeof cleanTechFormSchema>>;
