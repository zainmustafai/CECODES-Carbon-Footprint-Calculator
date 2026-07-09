"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/form/password-field";
import { useResetPassword } from "../hooks/use-reset-password";

export function ResetPasswordForm() {
  const t = useTranslations("auth.reset");
  const tc = useTranslations("auth.common");
  const { form, onSubmit, isSubmitting, serverError } = useResetPassword();
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <PasswordField
        label={tc("passwordLabel")}
        autoComplete="new-password"
        placeholder={tc("passwordPlaceholder")}
        toggleLabel={tc("togglePassword")}
        error={errors.password?.message}
        {...register("password")}
      />
      <PasswordField
        label={tc("confirmLabel")}
        autoComplete="new-password"
        placeholder={tc("passwordPlaceholder")}
        toggleLabel={tc("togglePassword")}
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />
      {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {t("submit")}
      </Button>
    </form>
  );
}
