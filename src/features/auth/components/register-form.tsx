"use client";

import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/form/text-field";
import { PasswordField } from "@/components/form/password-field";
import { useRegister } from "../hooks/use-register";

export function RegisterForm() {
  const t = useTranslations("auth.register");
  const tc = useTranslations("auth.common");
  const { form, onSubmit, isSubmitting, serverError, awaitingConfirmation, submittedEmail } =
    useRegister();
  const {
    register,
    formState: { errors },
  } = form;

  if (awaitingConfirmation) {
    return (
      <div className="space-y-2 text-sm">
        <p className="font-medium text-foreground">{t("checkEmailTitle")}</p>
        <p className="text-muted-foreground">
          {t("checkEmailBody", { email: submittedEmail ?? "" })}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <TextField
        label={tc("emailLabel")}
        type="email"
        autoComplete="email"
        placeholder={tc("emailPlaceholder")}
        startIcon={<Mail />}
        error={errors.email?.message}
        {...register("email")}
      />
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
