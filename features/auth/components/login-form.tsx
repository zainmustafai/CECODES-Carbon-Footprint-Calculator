"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/form/text-field";
import { useLogin } from "../hooks/use-login";

export function LoginForm() {
  const t = useTranslations("auth.login");
  const tc = useTranslations("auth.common");
  const { form, onSubmit, isSubmitting, serverError } = useLogin();
  const {
    register,
    formState: { errors },
  } = form;

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
        autoComplete="current-password"
        placeholder={tc("passwordPlaceholder")}
        error={errors.password?.message}
        {...register("password")}
      />
      {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {t("submit")}
      </Button>
    </form>
  );
}
