"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from "../schemas/auth-schemas";

export function useForgotPassword() {
  const tv = useTranslations("auth.validation");
  const tt = useTranslations("auth.toasts");
  const [sentEmail, setSentEmail] = useState<string | null>(null);

  const resolver = useMemo(() => zodResolver(forgotPasswordSchema(tv)), [tv]);
  const form = useForm<ForgotPasswordValues>({
    resolver,
    defaultValues: { email: "" },
  });

  const onSubmit = form.handleSubmit(async ({ email }) => {
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    // Always report success — never reveal whether the account exists.
    setSentEmail(email);
    toast.success(tt("resetEmailSent"));
  });

  return {
    form,
    onSubmit,
    isSubmitting: form.formState.isSubmitting,
    sent: sentEmail !== null,
    sentEmail,
  };
}
