import { z } from "zod";

// Translator for the "admin.users.validation" namespace (keeps messages localized).
type T = (key: string) => string;

const roleEnum = z.enum(["COMPANY_USER", "CECODES_ADMIN"]);

// INVARIANT: role CECODES_ADMIN implies companyId is null (an admin owns no company). This is
// enforced here (schema) and again when the actions write, because a comment cannot stop a bug.
function refineAdminHasNoCompany(
  value: { role: "COMPANY_USER" | "CECODES_ADMIN"; companyId?: string | null },
  ctx: z.RefinementCtx,
) {
  if (value.role === "CECODES_ADMIN" && value.companyId) {
    ctx.addIssue({ code: "custom", message: "adminNoCompany", path: ["companyId"] });
  }
}

// ---------------------------------------------------------------------------
// Server input schemas. The server NEVER trusts the client's schema: it re-validates every
// action argument with its own .strict() schema so an unknown key cannot ride into a write.
// AppUser.id and Company.id are Supabase/Postgres uuids, so z.uuid() everywhere, consistently.
// ---------------------------------------------------------------------------

export const createUserInput = z
  .object({
    // Trim and lowercase so the app_users.email unique check and the auth user agree on one
    // canonical form ("Foo@Bar.com" and "foo@bar.com" must not create two accounts).
    email: z.string().trim().toLowerCase().email(),
    tempPassword: z.string().min(8),
    role: roleEnum,
    companyId: z.uuid().nullish(),
  })
  .strict()
  .superRefine(refineAdminHasNoCompany);

export const updateUserInput = z
  .object({
    userId: z.uuid(),
    role: roleEnum,
    companyId: z.uuid().nullish(),
  })
  .strict()
  .superRefine(refineAdminHasNoCompany);

export const setUserActiveInput = z
  .object({
    userId: z.uuid(),
    active: z.boolean(),
  })
  .strict();

export const deleteUserInput = z
  .object({
    userId: z.uuid(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Client form schema factories (localized). The Radix Select cannot hold an empty-string
// value, so "no company" is carried through the form as this sentinel and mapped to null
// before the payload reaches the server.
// ---------------------------------------------------------------------------

export const NO_COMPANY = "__none__";

export function createUserFormSchema(t: T) {
  return z.object({
    email: z.string().trim().min(1, t("emailRequired")).email(t("emailInvalid")),
    tempPassword: z.string().min(8, t("passwordMin")),
    role: roleEnum,
    companyId: z.string(),
  });
}
export type CreateUserFormValues = z.infer<ReturnType<typeof createUserFormSchema>>;

export function updateUserFormSchema(t: T) {
  // Role and company always hold a valid value from the Select, so there is nothing to
  // localize yet. t is accepted for signature parity with createUserFormSchema and so a
  // future field-level message has a home.
  void t;
  return z.object({
    role: roleEnum,
    companyId: z.string(),
  });
}
export type UpdateUserFormValues = z.infer<ReturnType<typeof updateUserFormSchema>>;
