"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { generateTempPassword } from "@/lib/generate-password";
import { createFacility } from "@/features/facilities/actions/facility-actions";
import { createCompany } from "../actions/company-actions";
import { createUser } from "../actions/user-actions";
import {
  companyOnboardingSchema,
  ONBOARDING_STEP_FIELDS,
  type CompanyOnboardingValues,
} from "../schemas/company-onboarding-schema";

// What the wizard actually created, so the summary screen can report each step honestly. The
// company always exists once we reach a result; the facility and user are optional and each
// may have failed on its own without invalidating the company.
export type OnboardingResult = {
  companyId: string;
  companyName: string;
  facility: { name: string } | null;
  facilityError: string | null;
  user: { email: string; password: string } | null;
  userError: string | null;
};

const KNOWN_ERRORS = new Set([
  "generic",
  "forbidden",
  "facilityExists",
  "emailInUse",
  "authFailed",
  "companyNotFound",
]);

export function useCompanyOnboarding() {
  const tv = useTranslations("admin.onboarding.validation");
  const te = useTranslations("admin.onboarding.errors");
  const tt = useTranslations("admin.onboarding.toasts");
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);
  const [result, setResult] = useState<OnboardingResult | null>(null);

  const form = useForm<CompanyOnboardingValues>({
    resolver: zodResolver(companyOnboardingSchema(tv)),
    defaultValues: {
      companyName: "",
      sector: "",
      facilityName: "",
      facilityLocation: "",
      userEmail: "",
      userPassword: "",
    },
    mode: "onTouched",
  });

  const stepCount = ONBOARDING_STEP_FIELDS.length;
  const isLastStep = step === stepCount - 1;

  const translateError = (key: string) => te(KNOWN_ERRORS.has(key) ? key : "generic");

  async function next() {
    const valid = await form.trigger(ONBOARDING_STEP_FIELDS[step]);
    if (valid) setStep((current) => Math.min(current + 1, stepCount - 1));
  }

  function back() {
    setStep((current) => Math.max(current - 1, 0));
  }

  function fillGeneratedPassword() {
    form.setValue("userPassword", generateTempPassword(), {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    const toastId = toast.loading(tt("creating"));

    // 1. The company itself. If this fails, nothing downstream should run, and the admin is
    //    sent back to the step that owns the failing field.
    const company = await createCompany({ name: values.companyName, sector: values.sector });
    if (company.error || !company.companyId) {
      const message = translateError(company.error ?? "generic");
      toast.error(message, { id: toastId });
      setServerError(message);
      setStep(0);
      return;
    }
    const companyId = company.companyId;

    // 2. The optional first facility.
    let facility: OnboardingResult["facility"] = null;
    let facilityError: string | null = null;
    if (values.facilityName && values.facilityLocation) {
      const created = await createFacility({
        companyId,
        name: values.facilityName,
        location: values.facilityLocation,
      });
      if (created.error) facilityError = translateError(created.error);
      else facility = { name: values.facilityName };
    }

    // 3. The optional first user.
    let user: OnboardingResult["user"] = null;
    let userError: string | null = null;
    if (values.userEmail && values.userPassword) {
      const created = await createUser({
        email: values.userEmail,
        tempPassword: values.userPassword,
        role: "COMPANY_USER",
        companyId,
      });
      if (created.error) userError = translateError(created.error);
      else user = { email: values.userEmail.toLowerCase(), password: values.userPassword };
    }

    // The company is created either way; the summary spells out the optional steps. The toast
    // reflects the primary action so it never claims more than it should.
    toast.success(tt("created"), { id: toastId });
    setResult({
      companyId,
      companyName: values.companyName,
      facility,
      facilityError,
      user,
      userError,
    });
    router.refresh();
  });

  function restart() {
    form.reset();
    setStep(0);
    setServerError(null);
    setResult(null);
  }

  return {
    form,
    step,
    stepCount,
    isLastStep,
    next,
    back,
    fillGeneratedPassword,
    onSubmit,
    isSubmitting: form.formState.isSubmitting,
    serverError,
    result,
    restart,
  };
}
