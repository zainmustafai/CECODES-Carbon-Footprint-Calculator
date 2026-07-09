"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  resetPasswordSchema,
  type ResetPasswordValues,
} from "../schemas/auth-schemas";

export function useResetPassword() {
  const tv = useTranslations("auth.validation");
  const te = useTranslations("auth.errors");
  const tt = useTranslations("auth.toasts");
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const resolver = useMemo(() => zodResolver(resetPasswordSchema(tv)), [tv]);
  const form = useForm<ResetPasswordValues>({
    resolver,
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = form.handleSubmit(async ({ password }) => {
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setServerError(te("generic"));
      return;
    }
    toast.success(tt("passwordUpdated"));
    router.push("/dashboard");
    router.refresh();
  });

  return { form, onSubmit, isSubmitting: form.formState.isSubmitting, serverError };
}
