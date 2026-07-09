import { z } from "zod";

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
      password: z.string().min(8, t("passwordMin")),
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
      password: z.string().min(8, t("passwordMin")),
      confirmPassword: z.string().min(1, t("passwordRequired")),
    })
    .refine((values) => values.password === values.confirmPassword, {
      message: t("passwordsMismatch"),
      path: ["confirmPassword"],
    });
}
export type ResetPasswordValues = z.infer<ReturnType<typeof resetPasswordSchema>>;
