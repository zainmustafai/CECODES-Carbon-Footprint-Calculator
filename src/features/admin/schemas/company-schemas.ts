import { z } from "zod";

// Client schema factories take a translator so validation copy is localized. The server
// re-validates with its OWN strict schemas below and never trusts the client's.
type T = (key: string) => string;

// Shared by create and update. Deliberately a separate base object rather than extending
// createCompanyInput: contactEmail belongs to CREATE only (below), and a naive extend would
// silently widen the edit contract through its .strict() gate.
const companyCore = z.object({
  name: z.string().trim().min(1).max(160),
  sector: z.string().trim().max(160).optional(),
});

// A company is created with a name, an optional sector, and an optional contact email (the
// wizard captures it so the profile is complete from day one). Facilities are added by the
// wizard's own optional step or later from the company workspace.
export const createCompanyInput = companyCore
  .extend({
    // An empty string is a legitimate "no contact", not an invalid email (same contract as
    // updateCompanyProfileInput, which owns this field after creation).
    contactEmail: z.union([z.email(), z.literal("")]).optional(),
  })
  .strict();

// The admin edit dialog stays name + sector only; contactEmail is edited through the company
// profile form. Extending the CORE keeps contactEmail out of this contract on purpose.
export const updateCompanyInput = companyCore.extend({ companyId: z.uuid() }).strict();

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
