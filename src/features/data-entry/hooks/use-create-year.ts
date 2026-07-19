"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useFormSubmit } from "@/hooks/use-form-submit";
import { createReportingYear } from "../actions/reporting-years";
import {
  reportingYearFormSchema,
  type ReportingYearFormValues,
} from "../schemas/reporting-year-schema";

export function useCreateYear({
  facilityId,
  basePath,
  onDone,
}: {
  facilityId: string;
  basePath: string;
  onDone?: () => void;
}) {
  const tv = useTranslations("dataEntry.validation");
  const te = useTranslations("dataEntry.errors");
  const tt = useTranslations("dataEntry.toasts");
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const resolver = useMemo(() => zodResolver(reportingYearFormSchema(tv)), [tv]);
  const form = useForm<ReportingYearFormValues>({
    resolver,
    defaultValues: { year: new Date().getFullYear() },
  });

  const { onSubmit, isSubmitting } = useFormSubmit(form, async ({ year }) => {
    setServerError(null);
    const { error } = await createReportingYear({ facilityId, year });
    if (error) {
      setServerError(te(error));
      return;
    }
    toast.success(tt("yearCreated"));
    onDone?.();
    router.push(`${basePath}?facilityId=${facilityId}&year=${year}`);
    router.refresh();
  });

  return { form, onSubmit, isSubmitting, serverError };
}
