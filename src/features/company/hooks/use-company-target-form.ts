"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useFormSubmit } from "@/hooks/use-form-submit";
import { saveCompanyTarget } from "../actions/company-target-actions";
import {
  companyTargetFormSchema,
  type CompanyTargetFormValues,
} from "../schemas/company-target-schema";

// A form with a visible submit button (feedback shape 1): a Button spinner plus an inline
// server error, no loading toast.
export function useCompanyTargetForm({
  companyId,
  initialReductionPct,
}: {
  companyId: string;
  initialReductionPct: string;
}) {
  const tv = useTranslations("company.target.validation");
  const te = useTranslations("company.target.errors");
  const tt = useTranslations("company.target.toasts");
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<CompanyTargetFormValues>({
    resolver: zodResolver(companyTargetFormSchema(tv)),
    defaultValues: { reductionPct: initialReductionPct },
  });

  const { onSubmit, isSubmitting } = useFormSubmit(form, async (values) => {
    setServerError(null);

    const { error, cleared } = await saveCompanyTarget({
      companyId,
      reductionPct: values.reductionPct,
    });

    if (error) {
      setServerError(te(error));
      return;
    }

    toast.success(cleared ? tt("cleared") : tt("saved"));
    form.reset(values);
    router.refresh();
  });

  return { form, onSubmit, serverError, isSubmitting };
}
