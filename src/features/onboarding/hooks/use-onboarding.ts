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
import { useFormSubmit } from "@/hooks/use-form-submit";

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

  const { onSubmit, isSubmitting } = useFormSubmit(form, async (values) => {
    setServerError(null);
    const { error } = await createCompanyAction(values);
    if (error) {
      setServerError(te(error));
      return;
    }
    toast.success(tt("created"));
    // Refresh BEFORE navigating. The client router prefetched /dashboard while this user still
    // had no company, and that cached RSC redirects straight back to /onboarding. Pushing first
    // serves that stale entry and bounces the user back to the form they just completed.
    // Invalidating the cache first means the push fetches a fresh /dashboard that sees the new
    // company and renders it.
    router.refresh();
    router.push("/dashboard");
  });

  return { form, onSubmit, isSubmitting, serverError };
}
