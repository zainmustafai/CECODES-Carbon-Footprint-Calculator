"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
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

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    const { error } = await signInAction(values);
    if (error) {
      setServerError(te(error));
      return;
    }
    router.push("/dashboard");
    router.refresh();
  });

  return { form, onSubmit, isSubmitting: form.formState.isSubmitting, serverError };
}
