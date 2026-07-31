"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { generateTempPassword } from "@/lib/generate-password";
import { useFormSubmit } from "@/hooks/use-form-submit";
import { resetUserPassword } from "../actions/user-actions";
import {
  regenerateCredentialsFormSchema,
  type RegenerateCredentialsFormValues,
} from "../schemas/user-schemas";

// Two-phase flow: submit the new temporary password, then hold it in memory so the dialog can
// show the credentials box. The password exists in plaintext only here and only until the
// dialog closes; nothing rendered elsewhere changes, so there is no router.refresh.
export function useRegenerateCredentials({
  user,
}: {
  user: { id: string; email: string };
}) {
  const tv = useTranslations("admin.users.validation");
  const te = useTranslations("admin.users.errors");
  const tt = useTranslations("admin.users.toasts");
  const [serverError, setServerError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{
    email: string;
    password: string;
  } | null>(null);

  const resolver = useMemo(
    () => zodResolver(regenerateCredentialsFormSchema(tv)),
    [tv],
  );
  const form = useForm<RegenerateCredentialsFormValues>({
    resolver,
    defaultValues: { tempPassword: "" },
  });

  const { onSubmit, isSubmitting } = useFormSubmit(form, async (values) => {
    setServerError(null);
    const { error } = await resetUserPassword({
      userId: user.id,
      tempPassword: values.tempPassword,
    });
    if (error) {
      setServerError(te(error));
      return;
    }
    toast.success(tt("credentialsRegenerated"));
    setCredentials({ email: user.email, password: values.tempPassword });
  });

  function fillGeneratedPassword() {
    form.setValue("tempPassword", generateTempPassword(), {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  // Called when the dialog closes, so the next open starts at the form with nothing retained.
  function resetFlow() {
    form.reset({ tempPassword: "" });
    setCredentials(null);
    setServerError(null);
  }

  return {
    form,
    fillGeneratedPassword,
    onSubmit,
    isSubmitting,
    serverError,
    credentials,
    resetFlow,
  };
}
