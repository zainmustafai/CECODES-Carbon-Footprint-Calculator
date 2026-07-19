"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateCompanyProfile } from "../actions/company-actions";
import { useFormSubmit } from "@/hooks/use-form-submit";
import {
  companyProfileSchema,
  type CompanyProfileValues,
} from "../schemas/company-schema";

// A form with a visible submit button, so it follows the form half of the async policy:
// a Button spinner plus an inline server error. No loading toast; the spinner is focal.
export function useCompanyProfileForm({
  companyId,
  defaults,
}: {
  companyId: string;
  defaults: CompanyProfileValues;
}) {
  const tv = useTranslations("company.validation");
  const te = useTranslations("company.errors");
  const tt = useTranslations("company.toasts");
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<CompanyProfileValues>({
    resolver: zodResolver(companyProfileSchema(tv)),
    defaultValues: defaults,
  });

  const { onSubmit, isSubmitting } = useFormSubmit(form, async (values) => {
    setServerError(null);

    const { error } = await updateCompanyProfile({
      companyId,
      name: values.name,
      sector: values.sector,
      contactEmail: values.contactEmail,
    });

    if (error) {
      setServerError(te(error));
      return;
    }

    toast.success(tt("saved"));
    form.reset(values);
    router.refresh();
  });

  return { form, onSubmit, serverError, isSubmitting };
}
