import { z } from "zod";
import { PASSWORD_MIN } from "./auth-server-schemas";

// The browser half of the auth rules: same constraints as auth-server-schemas.ts, but phrased for
// a human and localized. The server does not trust any of it. PASSWORD_MIN is imported rather
// than repeated so the two halves cannot drift, which is exactly how the documented minimum came
// to exist only on this side.

// Translator for the "auth.validation" namespace (keeps messages localized).
type T = (key: string) => string;

export function loginSchema(t: T) {
  return z.object({
    email: z.string().min(1, t("emailRequired")).email(t("emailInvalid")),
    password: z.string().min(1, t("passwordRequired")),
  });
}
export type LoginValues = z.infer<ReturnType<typeof loginSchema>>;

export function registerSchema(t: T) {
  return z
    .object({
      email: z.string().min(1, t("emailRequired")).email(t("emailInvalid")),
      password: z.string().min(PASSWORD_MIN, t("passwordMin")),
      confirmPassword: z.string().min(1, t("passwordRequired")),
    })
    .refine((values) => values.password === values.confirmPassword, {
      message: t("passwordsMismatch"),
      path: ["confirmPassword"],
    });
}
export type RegisterValues = z.infer<ReturnType<typeof registerSchema>>;

export function forgotPasswordSchema(t: T) {
  return z.object({
    email: z.string().min(1, t("emailRequired")).email(t("emailInvalid")),
  });
}
export type ForgotPasswordValues = z.infer<ReturnType<typeof forgotPasswordSchema>>;

/**
 * `requireCurrent` marks the signed-in password change, and only that.
 *
 * The same form now serves two arrivals: the self-hosted recovery link (?token, anonymous, and the
 * user by definition does not know the old password), and the account menu's "change my password"
 * (a session, and they do). There was a third, a recovery link from the hosted auth provider,
 * which arrived WITH a session and still without knowledge of the old password; that is why the
 * distinction is carried by a flag rather than simply read off "is there a session". Only the
 * signed-in change can be asked to re-authenticate, so the field is optional in the shape and made
 * required by this flag. The server decides the same thing independently in
 * changeSignedInPassword; this half is so the box appears and so an empty one is caught before a
 * round trip.
 */
export function resetPasswordSchema(t: T, { requireCurrent = false } = {}) {
  return z
    .object({
      currentPassword: requireCurrent
        ? z.string().min(1, t("currentPasswordRequired"))
        : z.string().optional(),
      password: z.string().min(PASSWORD_MIN, t("passwordMin")),
      confirmPassword: z.string().min(1, t("passwordRequired")),
    })
    .refine((values) => values.password === values.confirmPassword, {
      message: t("passwordsMismatch"),
      path: ["confirmPassword"],
    });
}
export type ResetPasswordValues = z.infer<ReturnType<typeof resetPasswordSchema>>;
