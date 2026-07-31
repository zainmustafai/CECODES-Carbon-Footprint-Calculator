"use client";

import { useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { generateTempPassword } from "@/lib/generate-password";
import { createFacility } from "@/features/facilities/actions/facility-actions";
import { createReportingYear } from "@/features/data-entry/actions/reporting-years";
import { createCompany } from "../actions/company-actions";
import { createUser } from "../actions/user-actions";
import {
  companyOnboardingSchema,
  ONBOARDING_STEP_FIELDS,
  type CompanyOnboardingValues,
} from "../schemas/company-onboarding-schema";

// What the wizard actually created, so the summary screen can report each step honestly. The
// company always exists once we reach a result; the sede, year and user are optional and each
// may have failed on its own without invalidating the company.
export type OnboardingResult = {
  companyId: string;
  companyName: string;
  facility: { name: string } | null;
  facilityError: string | null;
  year: { year: number } | null;
  yearError: string | null;
  user: { email: string; password: string } | null;
  userError: string | null;
};

const KNOWN_ERRORS = new Set([
  "generic",
  "forbidden",
  "facilityExists",
  "yearExists",
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

  const resolver = useMemo(() => zodResolver(companyOnboardingSchema(tv)), [tv]);
  const form = useForm<CompanyOnboardingValues>({
    resolver,
    defaultValues: {
      companyName: "",
      sector: "",
      contactEmail: "",
      facilityName: "",
      facilityLocation: "",
      year: "",
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

  // createCompany has no natural idempotency key (Company.name is deliberately not unique), so a
  // double submission creates two real companies. The submit button disables on isSubmitting, but
  // that is a re-render behind the click: a synchronous second invocation of the handler fires
  // both server actions before the disable lands. This ref rejects the re-entry outright, and it
  // also protects a real admin who double-clicks. Verified from an e2e trace: one click, two
  // createCompany POSTs, two identical company cards.
  const submittingRef = useRef(false);
  // The visual pending state rides a transition, not form.formState.isSubmitting, which is
  // stale under the React Compiler (see use-form-submit.ts). createAll runs inside the
  // transition so the button spins for the whole multi-step create; the handleSubmit promise
  // still resolves when it settles (or when validation fails), which is what resets the ref.
  const [isSubmitting, startTransition] = useTransition();
  const submit = form.handleSubmit(
    (values) =>
      new Promise<void>((resolve) => {
        startTransition(async () => {
          try {
            await createAll(values);
          } finally {
            resolve();
          }
        });
      }),
  );

  // The ref guard lives in the event handler, where reading a ref is allowed, rather than inside
  // the handleSubmit callback (which the React Compiler treats as render-time). One click was
  // producing two createCompany POSTs and two identical companies; the submit button disables on
  // isSubmitting, but that is a render behind the click, so a synchronous re-entry slips past it.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    // Only the last step may submit. The wizard is one form, so a stray submit from an earlier
    // step (a pointer sequence that straddles the Siguiente -> Crear empresa step change) would
    // otherwise create the company before the admin finished, now that the button truly disables.
    if (!isLastStep) {
      event.preventDefault();
      return;
    }
    if (submittingRef.current) {
      event.preventDefault();
      return;
    }
    submittingRef.current = true;
    void submit(event).finally(() => {
      submittingRef.current = false;
    });
  }

  // Sequential, best-effort, deliberately NOT transactional: createUser goes through the
  // Supabase admin HTTP API and cannot join a Postgres transaction anyway, so full atomicity
  // is impossible and partial outcomes must be reported honestly either way. A company without
  // a sede is a legitimate supported state; the summary plus the company workspace (full CRUD)
  // are the retry path.
  async function createAll(values: CompanyOnboardingValues) {
    setServerError(null);

    // 1. The company itself. If this fails, nothing downstream should run, and the admin is
    //    sent back to the step that owns the failing field. Form feedback shape: the inline
    //    error is the failure surface; no error toast.
    const company = await createCompany({
      name: values.companyName,
      sector: values.sector.trim() ? values.sector.trim() : undefined,
      contactEmail: values.contactEmail.trim() ? values.contactEmail.trim() : undefined,
    });
    if (company.error || !company.companyId) {
      setServerError(translateError(company.error ?? "generic"));
      setStep(0);
      return;
    }
    const companyId = company.companyId;

    // 2. The optional first sede.
    let facility: OnboardingResult["facility"] = null;
    let facilityError: string | null = null;
    let facilityId: string | null = null;
    if (values.facilityName && values.facilityLocation) {
      const created = await createFacility({
        companyId,
        name: values.facilityName,
        location: values.facilityLocation,
      });
      if (created.error || !created.facilityId) {
        facilityError = translateError(created.error ?? "generic");
      } else {
        facility = { name: values.facilityName };
        facilityId = created.facilityId;
      }
    }

    // 3. The optional first reporting year, chained onto the sede just created. If the sede
    //    failed, the year records as skipped: the sede line already carries the failure.
    let year: OnboardingResult["year"] = null;
    let yearError: string | null = null;
    if (values.year && facilityId) {
      const created = await createReportingYear({
        facilityId,
        year: Number(values.year),
      });
      if (created.error) yearError = translateError(created.error);
      else year = { year: Number(values.year) };
    }

    // 4. The optional first user.
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
    toast.success(tt("created"));
    setResult({
      companyId,
      companyName: values.companyName,
      facility,
      facilityError,
      year,
      yearError,
      user,
      userError,
    });
    router.refresh();
  }

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
    isSubmitting,
    serverError,
    result,
    restart,
  };
}
