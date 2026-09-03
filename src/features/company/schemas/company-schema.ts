import { z } from "zod";

type T = (key: string) => string;

// An optional free-text profile field. "" is what an untouched input posts and means "not
// provided", which is NULL in the database, not an empty string: the report header tests these
// with plain truthiness, so a stored "" would render nothing while leaving a dirty row behind.
const optionalProfileText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value): string | null => (value === "" ? null : value));

// The form posts a string. "" is NULL; anything else must be a whole, non-negative count, so a
// negative or non-numeric entry is refused rather than reaching Prisma as NaN.
const optionalEmployeeCount = z
  .string()
  .trim()
  .transform((value): string | null => (value === "" ? null : value))
  .refine((value) => value === null || /^\d{1,9}$/.test(value), {
    message: "employeeCountInvalid",
  })
  .transform((value): number | null => (value === null ? null : Number(value)));

// The company profile a company user (or an admin, through the drill-down) can edit.
//
// `sector` stays a free string in the database even though the form offers a curated list.
// Companies onboarded before the list existed may hold arbitrary text, and a Postgres enum
// would have to be recreated to add a sector. The form surfaces an unknown stored value as a
// verbatim option rather than discarding it on save.
export const updateCompanyProfileInput = z
  .object({
    companyId: z.uuid(),
    name: z.string().trim().min(1).max(160),
    sector: z.string().trim().max(160).optional(),
    contactEmail: z.union([z.email(), z.literal("")]).optional(),
    // The six identifying details the report header prints. Optional like the two above, so a
    // payload that omits one leaves the stored value alone instead of clearing it.
    nit: optionalProfileText(50).optional(),
    employeeCount: optionalEmployeeCount.optional(),
    contactName: optionalProfileText(120).optional(),
    contactRole: optionalProfileText(120).optional(),
    contactPhone: optionalProfileText(40).optional(),
    website: optionalProfileText(200).optional(),
  })
  .strict();

export function companyProfileSchema(t: T) {
  return z.object({
    name: z.string().trim().min(1, t("nameRequired")),
    sector: z.string().optional(),
    // An empty string is a legitimate "no contact", not an invalid email.
    contactEmail: z.union([z.email(t("emailInvalid")), z.literal("")]).optional(),
    // The six profile fields stay strings in the form; the server null-ifies "" and coerces
    // the count, so the input and the schema output never diverge here. Every length limit
    // carries its own message: Zod's default is English prose, which would surface untranslated
    // in a Spanish UI the moment someone pasted a long address.
    nit: z.string().trim().max(50, t("tooLong")),
    employeeCount: z
      .string()
      .trim()
      .refine((value) => value === "" || /^\d{1,9}$/.test(value), t("employeeCountInvalid")),
    contactName: z.string().trim().max(120, t("tooLong")),
    contactRole: z.string().trim().max(120, t("tooLong")),
    contactPhone: z.string().trim().max(40, t("tooLong")),
    website: z.string().trim().max(200, t("tooLong")),
  });
}

export type CompanyProfileValues = z.infer<ReturnType<typeof companyProfileSchema>>;
