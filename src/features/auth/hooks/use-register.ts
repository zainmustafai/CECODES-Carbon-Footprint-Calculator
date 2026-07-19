"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useFormSubmit } from "@/hooks/use-form-submit";
import { registerSchema, type RegisterValues } from "../schemas/auth-schemas";
import { signUpAction } from "../actions/auth-actions";

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

  const { onSubmit, isSubmitting } = useFormSubmit(form, async ({ email, password }) => {
    setServerError(null);
    const { error, needsConfirmation } = await signUpAction({ email, password });

    if (error) {
      setServerError(te(error));
      return;
    }

    // Supabase requires email confirmation (no session yet).
    if (needsConfirmation) {
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
    isSubmitting,
    serverError,
    awaitingConfirmation: submittedEmail !== null,
    submittedEmail,
  };
}
