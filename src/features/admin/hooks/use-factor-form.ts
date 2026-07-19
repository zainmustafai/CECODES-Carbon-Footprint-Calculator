"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createFactor, updateFactor } from "../actions/factor-actions";
import { useFormSubmit } from "@/hooks/use-form-submit";
import { factorFormSchema, type FactorFormValues } from "../schemas/factor-schemas";

type UseFactorFormArgs = {
  mode: "create" | "edit";
  factorId?: string;
  defaultValues: FactorFormValues;
};

// The factor form has a visible submit button, so it follows the form policy: a Button
// spinner and an inline serverError, never a loading toast. A success toast confirms the
// write, then we navigate.
export function useFactorForm({ mode, factorId, defaultValues }: UseFactorFormArgs) {
  const tv = useTranslations("admin.factors.validation");
  const te = useTranslations("admin.factors.errors");
  const tt = useTranslations("admin.factors.toasts");
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const resolver = useMemo(() => zodResolver(factorFormSchema(tv)), [tv]);
  const form = useForm<FactorFormValues>({ resolver, defaultValues });

  // Read isDirty DURING render, not only inside the submit handler. formState is a Proxy that
  // enables tracking for a field only when that field is read during render; a value read only
  // in a callback is never subscribed and stays false. Without this, editing a factor and
  // saving silently no-ops as "sin cambios" even though the field changed. Destructuring here is
  // the subscription. isSubmitting comes from useFormSubmit instead: the same Proxy read is
  // unreliable for it under the React Compiler (see use-form-submit.ts).
  const { isDirty } = form.formState;

  const { onSubmit, isSubmitting } = useFormSubmit(form, async (values) => {
    setServerError(null);

    if (mode === "edit") {
      if (!factorId) return;
      // Nothing changed: skip the round trip and say so. The server also refuses to write an
      // audit row for an empty diff, so this stays honest even for a comma-only edit.
      if (!isDirty) {
        toast(tt("noChanges"));
        return;
      }
      const { error } = await updateFactor({ factorId, ...values });
      if (error) {
        setServerError(te(error));
        return;
      }
      toast.success(tt("updated"));
      form.reset(values);
      router.refresh();
      return;
    }

    const { error } = await createFactor(values);
    if (error) {
      setServerError(te(error));
      return;
    }
    toast.success(tt("created"));
    router.push("/admin/factors");
  });

  return { form, onSubmit, isSubmitting, serverError };
}
