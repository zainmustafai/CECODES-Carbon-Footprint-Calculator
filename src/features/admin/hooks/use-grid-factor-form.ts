"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useToastAction } from "@/hooks/use-toast-action";
import { deleteGridFactor, upsertGridFactor } from "../actions/factor-actions";
import {
  gridFactorFormSchema,
  type GridFactorFormValues,
} from "../schemas/factor-schemas";

type GridFactorDefaults = { year: string; factor: string; source: string };

// The grid-factor dialog handles both create ("Agregar año") and edit. Upsert by year makes
// the two paths identical on the server.
export function useGridFactorForm({
  gridFactor,
  onDone,
}: {
  gridFactor?: GridFactorDefaults;
  onDone?: () => void;
}) {
  const tv = useTranslations("admin.factors.validation");
  const te = useTranslations("admin.factors.errors");
  const tt = useTranslations("admin.factors.toasts");
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const resolver = useMemo(() => zodResolver(gridFactorFormSchema(tv)), [tv]);
  const form = useForm<GridFactorFormValues>({
    resolver,
    defaultValues: {
      year: gridFactor?.year ?? "",
      factor: gridFactor?.factor ?? "",
      source: gridFactor?.source ?? "",
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    const { error } = await upsertGridFactor(values);
    if (error) {
      setServerError(te(error));
      return;
    }
    toast.success(tt("gridSaved"));
    form.reset(gridFactor ? values : { year: "", factor: "", source: "" });
    onDone?.();
    router.refresh();
  });

  return { form, onSubmit, isSubmitting: form.formState.isSubmitting, serverError };
}

// Deleting a grid-factor year is an imperative row action, so it uses the toast standard.
export function useGridFactorDelete() {
  const tt = useTranslations("admin.factors.toasts");
  const te = useTranslations("admin.factors.errors");
  const { isPending, run } = useToastAction();

  const remove = (year: number) =>
    run(() => deleteGridFactor({ year }), {
      loading: tt("gridDeleting"),
      success: tt("gridDeleted"),
      errorMessage: (key) => te(key),
    });

  return { isPending, remove };
}
