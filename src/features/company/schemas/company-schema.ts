import { z } from "zod";

type T = (key: string) => string;

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
  })
  .strict();

export function companyProfileSchema(t: T) {
  return z.object({
    name: z.string().trim().min(1, t("nameRequired")),
    sector: z.string().optional(),
    // An empty string is a legitimate "no contact", not an invalid email.
    contactEmail: z.union([z.email(t("emailInvalid")), z.literal("")]).optional(),
  });
}

export type CompanyProfileValues = z.infer<ReturnType<typeof companyProfileSchema>>;
