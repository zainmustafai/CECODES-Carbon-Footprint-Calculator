"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useFormSubmit } from "@/hooks/use-form-submit";
import { loginSchema, type LoginValues } from "../schemas/auth-schemas";
import { signInAction } from "../actions/auth-actions";

export function useLogin() {
  const tv = useTranslations("auth.validation");
  const te = useTranslations("auth.errors");
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const resolver = useMemo(() => zodResolver(loginSchema(tv)), [tv]);
  const form = useForm<LoginValues>({
    resolver,
    defaultValues: { email: "", password: "" },
  });

  // useFormSubmit drives the pending state from a transition so the button reliably disables
  // and spins (form.formState.isSubmitting does not under the React Compiler), and stays
  // pending through the push to /dashboard so it never goes idle while that page loads.
  const { onSubmit, isSubmitting } = useFormSubmit(form, async (values) => {
    setServerError(null);
    const { error } = await signInAction(values);
    if (error) {
      setServerError(te(error));
      return;
    }
    router.push("/dashboard");
    router.refresh();
  });

  return { form, onSubmit, isSubmitting, serverError };
}
