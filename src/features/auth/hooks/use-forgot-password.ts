"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from "../schemas/auth-schemas";
import { requestPasswordResetAction } from "../actions/auth-actions";

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
    await requestPasswordResetAction(email);
    // Always report success - never reveal whether the account exists.
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
