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

export function resetPasswordSchema(t: T) {
  return z
    .object({
      password: z.string().min(PASSWORD_MIN, t("passwordMin")),
      confirmPassword: z.string().min(1, t("passwordRequired")),
    })
    .refine((values) => values.password === values.confirmPassword, {
      message: t("passwordsMismatch"),
      path: ["confirmPassword"],
    });
}
export type ResetPasswordValues = z.infer<ReturnType<typeof resetPasswordSchema>>;
