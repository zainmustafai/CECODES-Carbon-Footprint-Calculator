"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/form/password-field";
import { useResetPassword } from "../hooks/use-reset-password";

// The token is handed straight to the hook and never to a field, a label or an error. It is a
// bearer credential: anything that renders it puts it somewhere a screenshot, a support ticket or
// a browser extension can pick it up.
//
// requireCurrentPassword comes from the server (ResetPasswordScreen), because whether the old
// password can be demanded is a fact about the provider and the arrival, not about the browser.
export function ResetPasswordForm({
  token,
  requireCurrentPassword = false,
}: {
  token?: string;
  requireCurrentPassword?: boolean;
}) {
  const t = useTranslations("auth.reset");
  const tc = useTranslations("auth.common");
  const { form, onSubmit, isSubmitting, serverError } = useResetPassword({
    token,
    requireCurrentPassword,
  });
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {requireCurrentPassword ? (
        <PasswordField
          label={tc("currentPasswordLabel")}
          // "current-password", so a manager offers the stored secret here and a new one below.
          autoComplete="current-password"
          placeholder={tc("passwordPlaceholder")}
          toggleLabel={tc("togglePassword")}
          error={errors.currentPassword?.message}
          {...register("currentPassword")}
        />
      ) : null}
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
      <Button type="submit" className="w-full" loading={isSubmitting}>
        {t("submit")}
      </Button>
    </form>
  );
}
