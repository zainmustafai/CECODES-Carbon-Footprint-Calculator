"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  onboardingSchema,
  type OnboardingValues,
} from "../schemas/onboarding-schema";
import { createCompanyAction } from "../actions/onboarding-actions";

export function useOnboarding() {
  const tv = useTranslations("onboarding.validation");
  const te = useTranslations("onboarding.errors");
  const tt = useTranslations("onboarding.toasts");
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const resolver = useMemo(() => zodResolver(onboardingSchema(tv)), [tv]);
  const form = useForm<OnboardingValues>({
    resolver,
    defaultValues: {
      companyName: "",
      sector: "",
      facilityName: "",
      facilityLocation: "",
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    const { error } = await createCompanyAction(values);
    if (error) {
      setServerError(te(error));
      return;
    }
    toast.success(tt("created"));
    router.push("/dashboard");
    router.refresh();
  });

  return { form, onSubmit, isSubmitting: form.formState.isSubmitting, serverError };
}
