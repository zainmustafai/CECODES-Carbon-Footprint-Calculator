import { z } from "zod";
import { EMAIL_MAX, PASSWORD_MAX } from "@/features/auth/schemas/auth-server-schemas";

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
// AppUser.id and Company.id are uuids (AppUser's were issued by the auth provider this replaced
// and carried across byte-identical), so z.uuid() everywhere, consistently.
// ---------------------------------------------------------------------------

// Identity/contact fields for traceability (CECODES, 2026-07-18). All optional: an admin may
// create the account before knowing them, and existing accounts predate the fields. An empty
// string from the form is normalized to undefined so it stores as NULL rather than "".
const optionalContact = z
  .string()
  .trim()
  .max(160)
  .optional()
  .transform((v) => (v === "" ? undefined : v));

export const createUserInput = z
  .object({
    // Trim and lowercase so this address arrives in the one canonical form everything else uses:
    // the app_users.email unique index, the sign-in lookup and the throttle keys are all built
    // from it ("Foo@Bar.com" and "foo@bar.com" must not create two accounts, and must not buy a
    // second allowance either).
    //
    // Bounded for the reason EMAIL_MAX gives: this address becomes an auth_throttle primary key
    // the first time resetUserPassword clears the lockout on it, and that column is a btree entry.
    email: z.string().trim().toLowerCase().max(EMAIL_MAX).email(),
    // Capped because bcrypt hashes at most 72 bytes and ignores the rest: a longer temporary
    // password would be silently truncated, and the admin would dictate characters that turn out
    // not to matter. See PASSWORD_MAX.
    tempPassword: z.string().min(8).max(PASSWORD_MAX),
    role: roleEnum,
    companyId: z.uuid().nullish(),
    name: optionalContact,
    phone: optionalContact,
    position: optionalContact,
  })
  .strict()
  .superRefine(refineAdminHasNoCompany);

export const updateUserInput = z
  .object({
    userId: z.uuid(),
    role: roleEnum,
    companyId: z.uuid().nullish(),
    name: optionalContact,
    phone: optionalContact,
    position: optionalContact,
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

export const resetUserPasswordInput = z
  .object({
    userId: z.uuid(),
    tempPassword: z.string().min(8).max(PASSWORD_MAX),
  })
  .strict();

// ---------------------------------------------------------------------------
// Client form schema factories (localized). The Radix Select cannot hold an empty-string
// value, so "no company" is carried through the form as this sentinel and mapped to null
// before the payload reaches the server.
// ---------------------------------------------------------------------------

export const NO_COMPANY = "__none__";

// Contact fields on the form are plain optional strings (the box may be left empty). Length is
// bounded to match the server schema so a too-long value fails on the client first.
const contactField = z.string().trim().max(160);

export function createUserFormSchema(t: T) {
  return z.object({
    email: z.string().trim().min(1, t("emailRequired")).email(t("emailInvalid")),
    tempPassword: z.string().min(8, t("passwordMin")).max(PASSWORD_MAX, t("passwordMax")),
    role: roleEnum,
    companyId: z.string(),
    name: contactField,
    phone: contactField,
    position: contactField,
  });
}
export type CreateUserFormValues = z.infer<ReturnType<typeof createUserFormSchema>>;

export function regenerateCredentialsFormSchema(t: T) {
  return z.object({
    tempPassword: z.string().min(8, t("passwordMin")).max(PASSWORD_MAX, t("passwordMax")),
  });
}
export type RegenerateCredentialsFormValues = z.infer<
  ReturnType<typeof regenerateCredentialsFormSchema>
>;

export function updateUserFormSchema(t: T) {
  // Role and company always hold a valid value from the Select, so there is nothing to
  // localize yet. t is accepted for signature parity with createUserFormSchema and so a
  // future field-level message has a home.
  void t;
  return z.object({
    role: roleEnum,
    companyId: z.string(),
    name: contactField,
    phone: contactField,
    position: contactField,
  });
}
export type UpdateUserFormValues = z.infer<ReturnType<typeof updateUserFormSchema>>;
