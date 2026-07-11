import { z } from "zod";

// Client schema factories take a translator so validation copy is localized. The server
// re-validates with its OWN strict schemas below and never trusts the client's.
type T = (key: string) => string;

// A company is created with only a name and an optional sector. Facilities are added later
// from the company workspace (the admin drill-down route has full facility CRUD), so this
// action never creates a first facility.
export const createCompanyInput = z
  .object({
    name: z.string().trim().min(1).max(160),
    sector: z.string().trim().max(160).optional(),
  })
  .strict();

export const updateCompanyInput = createCompanyInput
  .extend({ companyId: z.uuid() })
  .strict();

export const setCompanyActiveInput = z
  .object({ companyId: z.uuid(), active: z.boolean() })
  .strict();

export const deleteCompanyInput = z.object({ companyId: z.uuid() }).strict();

// The client form. sector stays a plain string here because a Radix Select always yields a
// string; an empty string means "no sector chosen". The hook normalizes that empty string
// away before writing so the server records an absent sector as null.
export function companyFormSchema(t: T) {
  return z.object({
    name: z.string().trim().min(1, t("nameRequired")).max(160),
    sector: z.string().trim().max(160),
  });
}

export type CompanyFormValues = z.infer<ReturnType<typeof companyFormSchema>>;
