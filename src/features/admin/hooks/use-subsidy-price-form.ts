"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useToastAction } from "@/hooks/use-toast-action";
import { useFormSubmit } from "@/hooks/use-form-submit";
import { deleteSubsidyPrice, upsertSubsidyPrice } from "../actions/factor-actions";
import {
  subsidyPriceFormSchema,
  type SubsidyPriceFormValues,
} from "../schemas/factor-schemas";

type SubsidyPriceDefaults = { year: string; pricePerGallonCop: string; source: string };

// Average price per gallon (COP) by year - Scope 3 Cat 6 "Subsidios de transporte" (client
// feedback 2026-08-15). Same upsert-by-year dialog shape as useGridFactorForm.
export function useSubsidyPriceForm({
  subsidyPrice,
  onDone,
}: {
  subsidyPrice?: SubsidyPriceDefaults;
  onDone?: () => void;
}) {
  const tv = useTranslations("admin.factors.validation");
  const te = useTranslations("admin.factors.errors");
  const tt = useTranslations("admin.factors.toasts");
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const resolver = useMemo(() => zodResolver(subsidyPriceFormSchema(tv)), [tv]);
  const form = useForm<SubsidyPriceFormValues>({
    resolver,
    defaultValues: {
      year: subsidyPrice?.year ?? "",
      pricePerGallonCop: subsidyPrice?.pricePerGallonCop ?? "",
      source: subsidyPrice?.source ?? "",
    },
  });

  const { onSubmit, isSubmitting } = useFormSubmit(form, async (values) => {
    setServerError(null);
    const { error } = await upsertSubsidyPrice({
      ...values,
      mode: subsidyPrice ? "edit" : "create",
    });
    if (error) {
      setServerError(te(error));
      return;
    }
    toast.success(tt("subsidySaved"));
    form.reset(subsidyPrice ? values : { year: "", pricePerGallonCop: "", source: "" });
    onDone?.();
    router.refresh();
  });

  return { form, onSubmit, isSubmitting, serverError };
}

export function useSubsidyPriceDelete() {
  const tt = useTranslations("admin.factors.toasts");
  const te = useTranslations("admin.factors.errors");
  const { isPending, run } = useToastAction();

  const remove = (year: number) =>
    run(() => deleteSubsidyPrice({ year }), {
      loading: tt("subsidyDeleting"),
      success: tt("subsidyDeleted"),
      errorMessage: (key) => te(key),
    });

  return { isPending, remove };
}
