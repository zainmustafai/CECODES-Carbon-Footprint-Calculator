"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { registerSchema, type RegisterValues } from "../schemas/auth-schemas";
import { isEmailInUse } from "../lib/errors";

export function useRegister() {
  const tv = useTranslations("auth.validation");
  const te = useTranslations("auth.errors");
  const tt = useTranslations("auth.toasts");
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const resolver = useMemo(() => zodResolver(registerSchema(tv)), [tv]);
  const form = useForm<RegisterValues>({
    resolver,
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  const onSubmit = form.handleSubmit(async ({ email, password }) => {
    setServerError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setServerError(isEmailInUse(error) ? te("emailInUse") : te("generic"));
      return;
    }

    // No session => Supabase requires email confirmation.
    if (!data.session) {
      setSubmittedEmail(email);
      toast.success(tt("registerCheckEmail"));
      return;
    }

    router.push("/dashboard");
    router.refresh();
  });

  return {
    form,
    onSubmit,
    isSubmitting: form.formState.isSubmitting,
    serverError,
    awaitingConfirmation: submittedEmail !== null,
    submittedEmail,
  };
}
