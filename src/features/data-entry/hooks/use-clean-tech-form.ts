"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useFormSubmit } from "@/hooks/use-form-submit";
import { addCleanTechAction, updateCleanTechAction } from "../actions/clean-tech";
import {
  cleanTechFormSchema,
  type CleanTechFormValues,
} from "../schemas/clean-tech-schema";

export type CleanTechRowVM = {
  id: string;
  scope: "SCOPE_1" | "SCOPE_2" | "SCOPE_3" | null;
  category: string | null;
  subcategory: string | null;
  element: string;
  /** Decimal string, or null when the practice was reported without a number. */
  quantity: string | null;
  unit: string | null;
};

// One form drives both "add" and "edit": pass `row` to edit it in place. The dialog form
// pattern (Button spinner + inline serverError) follows IMPLEMENTATION.md section 4, and the
// pending flag comes from useFormSubmit for the React Compiler reason documented there.
export function useCleanTechForm({
  reportingYearId,
  row,
  onDone,
}: {
  reportingYearId: string;
  row: CleanTechRowVM | null;
  onDone?: () => void;
}) {
  const tv = useTranslations("dataEntry.validation");
  const te = useTranslations("dataEntry.errors");
  const tt = useTranslations("dataEntry.toasts");
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const resolver = useMemo(() => zodResolver(cleanTechFormSchema(tv)), [tv]);
  const form = useForm<CleanTechFormValues>({
    resolver,
    defaultValues: {
      scope: row?.scope ?? "",
      category: row?.category ?? "",
      subcategory: row?.subcategory ?? "",
      element: row?.element ?? "",
      quantity: row?.quantity ?? "",
      unit: row?.unit ?? "",
    },
  });

  const { onSubmit, isSubmitting } = useFormSubmit(form, async (values) => {
    setServerError(null);
    const payload = {
      reportingYearId,
      scope: values.scope === "" ? null : values.scope,
      category: values.category,
      subcategory: values.subcategory,
      element: values.element,
      quantity: values.quantity,
      unit: values.unit,
    };

    const result = row
      ? await updateCleanTechAction({ id: row.id, ...payload })
      : await addCleanTechAction(payload);

    if (result.error) {
      setServerError(te(result.error));
      return;
    }

    toast.success(tt(row ? "cleanTechUpdated" : "cleanTechAdded"));
    router.refresh();
    if (!row) form.reset();
    onDone?.();
  });

  return { form, onSubmit, isSubmitting, serverError };
}
