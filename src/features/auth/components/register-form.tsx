"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/form/text-field";
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
        error={errors.email?.message}
        {...register("email")}
      />
      <TextField
        label={tc("passwordLabel")}
        type="password"
        autoComplete="new-password"
        placeholder={tc("passwordPlaceholder")}
        error={errors.password?.message}
        {...register("password")}
      />
      <TextField
        label={tc("confirmLabel")}
        type="password"
        autoComplete="new-password"
        placeholder={tc("passwordPlaceholder")}
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
