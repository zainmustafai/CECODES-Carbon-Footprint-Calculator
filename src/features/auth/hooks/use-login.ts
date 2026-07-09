"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loginSchema, type LoginValues } from "../schemas/auth-schemas";

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

  const onSubmit = form.handleSubmit(async ({ email, password }) => {
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setServerError(te("invalidCredentials"));
      return;
    }
    router.push("/dashboard");
    router.refresh();
  });

  return { form, onSubmit, isSubmitting: form.formState.isSubmitting, serverError };
}
