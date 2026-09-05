"use client";

import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/form/text-field";
import { useHydrated } from "@/hooks/use-form-submit";
import { useForgotPassword } from "../hooks/use-forgot-password";

export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgot");
  const tc = useTranslations("auth.common");
  // Pre-hydration a submit is native, not React: see useHydrated in @/hooks/use-form-submit.
  const hydrated = useHydrated();
  const { form, onSubmit, isSubmitting, sent, sentEmail } = useForgotPassword();
  const {
    register,
    formState: { errors },
  } = form;

  if (sent) {
    return (
      <div className="space-y-2 text-sm">
        <p className="font-medium text-foreground">{t("sentTitle")}</p>
        <p className="text-muted-foreground">{t("sentBody", { email: sentEmail ?? "" })}</p>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4" noValidate>
      <TextField
        label={tc("emailLabel")}
        type="email"
        autoComplete="email"
        placeholder={tc("emailPlaceholder")}
        startIcon={<Mail />}
        error={errors.email?.message}
        {...register("email")}
      />
      <Button type="submit" disabled={!hydrated} className="w-full" loading={isSubmitting}>
        {t("submit")}
      </Button>
    </form>
  );
}
