"use client";

import Link from "next/link";
import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/form/text-field";
import { PasswordField } from "@/components/form/password-field";
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
        startIcon={<Mail />}
        error={errors.email?.message}
        {...register("email")}
      />

      <div className="space-y-1.5">
        <PasswordField
          label={tc("passwordLabel")}
          autoComplete="current-password"
          placeholder={tc("passwordPlaceholder")}
          toggleLabel={tc("togglePassword")}
          error={errors.password?.message}
          {...register("password")}
        />
        <div className="text-right">
          <Link
            href="/forgot-password"
            className="text-sm text-primary hover:underline"
          >
            {t("forgot")}
          </Link>
        </div>
      </div>

      {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {t("submit")}
      </Button>
    </form>
  );
}
