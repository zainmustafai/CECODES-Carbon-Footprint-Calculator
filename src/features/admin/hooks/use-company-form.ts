"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createCompany, updateCompany } from "../actions/company-actions";
import { useFormSubmit } from "@/hooks/use-form-submit";
import { companyFormSchema, type CompanyFormValues } from "../schemas/company-schemas";

type UseCompanyFormArgs = {
  company?: { id: string; name: string; sector: string | null };
  onDone?: () => void;
};

// The company create/edit form. A visible submit button means this uses a Button spinner
// and an inline serverError, not a loading toast (the async-feedback policy for forms). A
// success toast still fires, then the dialog closes and the list refreshes.
export function useCompanyForm({ company, onDone }: UseCompanyFormArgs) {
  const tv = useTranslations("admin.companies.validation");
  const te = useTranslations("admin.companies.errors");
  const tt = useTranslations("admin.companies.toasts");
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const resolver = useMemo(() => zodResolver(companyFormSchema(tv)), [tv]);
  const form = useForm<CompanyFormValues>({
    resolver,
    defaultValues: { name: company?.name ?? "", sector: company?.sector ?? "" },
  });

  const { onSubmit, isSubmitting } = useFormSubmit(form, async (values) => {
    setServerError(null);
    // An empty (or whitespace-only) sector means "none chosen": omit it so the action
    // records null instead of an empty string.
    const sector = values.sector.trim() ? values.sector.trim() : undefined;
    const name = values.name.trim();

    const { error } = company
      ? await updateCompany({ companyId: company.id, name, sector })
      : await createCompany({ name, sector });

    if (error) {
      setServerError(te(error));
      return;
    }

    toast.success(tt(company ? "updated" : "created"));
    form.reset(
      company ? { name: values.name, sector: values.sector } : { name: "", sector: "" },
    );
    onDone?.();
    router.refresh();
  });

  return { form, onSubmit, isSubmitting, serverError };
}
