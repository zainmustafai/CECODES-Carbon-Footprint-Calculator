"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useFormSubmit } from "@/hooks/use-form-submit";
import { POST_LOGIN_PATH } from "@/lib/routes";
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

    // Unreachable as it stands. signUpAction returns { error: "registrationDisabled" }
    // unconditionally, so the guard above always returns first and needsConfirmation is never
    // set. Kept rather than deleted because this is the branch self-registration needs if it
    // comes back, and it no longer carries a provider's answer: the old flow set the flag because
    // the auth provider required the address to be confirmed and issued no session until it was.
    // Whatever reopens /register decides that on its own terms.
    if (needsConfirmation) {
      setSubmittedEmail(email);
      toast.success(tt("registerCheckEmail"));
      return;
    }

    router.push(POST_LOGIN_PATH);
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
