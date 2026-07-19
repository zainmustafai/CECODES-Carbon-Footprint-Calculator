"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createFacility, updateFacility } from "../actions/facility-actions";
import { useFormSubmit } from "@/hooks/use-form-submit";
import { facilityFormSchema, type FacilityFormValues } from "../schemas/facility-schema";

type UseFacilityFormArgs = {
  companyId: string;
  facility?: { id: string; name: string; location: string };
  onDone?: () => void;
};

export function useFacilityForm({ companyId, facility, onDone }: UseFacilityFormArgs) {
  const tv = useTranslations("facilities.validation");
  const te = useTranslations("facilities.errors");
  const tt = useTranslations("facilities.toasts");
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const resolver = useMemo(() => zodResolver(facilityFormSchema(tv)), [tv]);
  const form = useForm<FacilityFormValues>({
    resolver,
    defaultValues: { name: facility?.name ?? "", location: facility?.location ?? "" },
  });

  const { onSubmit, isSubmitting } = useFormSubmit(form, async (values) => {
    setServerError(null);
    const { error } = facility
      ? await updateFacility({ facilityId: facility.id, ...values })
      : await createFacility({ companyId, ...values });

    if (error) {
      setServerError(te(error));
      return;
    }

    toast.success(tt(facility ? "updated" : "created"));
    form.reset(facility ? values : { name: "", location: "" });
    onDone?.();
    router.refresh();
  });

  return { form, onSubmit, isSubmitting, serverError };
}
