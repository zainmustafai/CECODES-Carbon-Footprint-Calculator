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

/** Gasoline or diesel. Half the key, so the dialog locks it while editing an existing row. */
export type SubsidyFuel = SubsidyPriceFormValues["fuel"];

type SubsidyPriceDefaults = {
  year: string;
  fuel: SubsidyFuel;
  pricePerGallonCop: string;
  source: string;
};

// Average price per gallon (COP) by year and fuel - Scope 3 Cat 6 "Subsidios de transporte"
// (client feedback 2026-08-15). Same upsert dialog shape as useGridFactorForm.
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
      fuel: subsidyPrice?.fuel ?? "GASOLINE",
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
    form.reset(
      subsidyPrice
        ? values
        : { year: "", fuel: "GASOLINE", pricePerGallonCop: "", source: "" },
    );
    onDone?.();
    router.refresh();
  });

  return { form, onSubmit, isSubmitting, serverError };
}

export function useSubsidyPriceDelete() {
  const tt = useTranslations("admin.factors.toasts");
  const te = useTranslations("admin.factors.errors");
  const { isPending, run } = useToastAction();

  const remove = (year: number, fuel: SubsidyFuel) =>
    run(() => deleteSubsidyPrice({ year, fuel }), {
      loading: tt("subsidyDeleting"),
      success: tt("subsidyDeleted"),
      errorMessage: (key) => te(key),
    });

  return { isPending, remove };
}
