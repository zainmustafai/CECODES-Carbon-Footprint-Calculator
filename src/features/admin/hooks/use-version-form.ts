"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createFactorVersion } from "../actions/factor-actions";
import { versionFormSchema, type VersionFormValues } from "../schemas/factor-schemas";

// A dialog form with a visible submit button: Button spinner plus inline serverError, and a
// success toast. No loading toast.
export function useVersionForm({ onDone }: { onDone?: () => void }) {
  const tv = useTranslations("admin.factors.validation");
  const te = useTranslations("admin.factors.errors");
  const tt = useTranslations("admin.factors.toasts");
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const resolver = useMemo(() => zodResolver(versionFormSchema(tv)), [tv]);
  const form = useForm<VersionFormValues>({
    resolver,
    defaultValues: {
      version: "",
      date: "",
      preparedBy: "",
      reviewedBy: "",
      authorizedBy: "",
      description: "",
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    const { error } = await createFactorVersion(values);
    if (error) {
      setServerError(te(error));
      return;
    }
    toast.success(tt("versionCreated"));
    form.reset();
    onDone?.();
    router.refresh();
  });

  return { form, onSubmit, isSubmitting: form.formState.isSubmitting, serverError };
}
