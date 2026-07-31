"use client";

import { useState } from "react";
import Link from "next/link";
import { Controller, useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarPlus,
  Check,
  CheckCircle2,
  MapPin,
  Plus,
  RefreshCw,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { TextField } from "@/components/form/text-field";
import { SelectField, type SelectFieldOption } from "@/components/form/select-field";
import { SECTORS } from "@/lib/sectors";
import { cn } from "@/lib/utils";
import { CredentialsBox } from "./credentials-box";
import { useCompanyOnboarding, type OnboardingResult } from "../hooks/use-company-onboarding";

const STEP_ICONS = [Building2, MapPin, CalendarPlus, UserPlus] as const;

// The "Nueva empresa" entry point on the companies list: a button opening the wizard in a
// dialog, in place, instead of the old full-page route. Mounted only while open (the house
// pattern from clean-tech-section): every open gets a fresh form and step 0, and closing
// discards state by unmount, so there is no reset dance.
export function CompanyWizardDialog() {
  const t = useTranslations("admin.companies");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        {t("create")}
      </Button>
      {open ? <WizardDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function WizardDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("admin.onboarding");
  const tSectors = useTranslations("company.sectors");
  const {
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
  } = useCompanyOnboarding();
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Every close path funnels through here: the X, Cancelar, Escape, and the overlay (which is
  // blocked outright). Dirtiness is computed from getValues(), NOT form.formState.isDirty:
  // RHF only maintains that flag when it is read during render, and this component
  // deliberately never reads formState in render (the React Compiler memoizes such reads;
  // see use-form-submit.ts), so the flag would sit stale at false. Every default is "", so
  // any non-empty value means the admin typed something worth confirming over.
  function requestClose() {
    if (isSubmitting) return;
    const dirty =
      step > 0 || Object.values(form.getValues()).some((value) => value !== "");
    if (!result && dirty) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }

  const sectorOptions: SelectFieldOption[] = SECTORS.map((slug) => ({
    value: slug,
    label: tSectors(slug),
  }));

  const {
    register,
    formState: { errors },
  } = form;

  // Drives the year step's two modes; subscribes to the two fields, compiler-friendly.
  const [facilityName, facilityLocation] = useWatch({
    control: form.control,
    name: ["facilityName", "facilityLocation"],
  });
  const hasFacility = facilityName.trim().length > 0 && facilityLocation.trim().length > 0;

  const stepLabels = [
    t("steps.company"),
    t("steps.facility"),
    t("steps.year"),
    t("steps.user"),
  ];

  return (
    <>
      <Dialog open onOpenChange={(nextOpen) => (!nextOpen ? requestClose() : undefined)}>
        <DialogContent
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto sm:max-w-lg"
          // A multi-step form must never be dismissed by a stray outside click; Escape flows
          // through requestClose, which confirms when there is anything to lose.
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            requestClose();
          }}
        >
          {result ? (
            <WizardSummary result={result} onRestart={restart} onClose={onClose} />
          ) : (
            <form onSubmit={onSubmit} noValidate className="space-y-6">
              <DialogHeader>
                <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
                  <DialogTitle>{t("pageTitle")}</DialogTitle>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {t("stepCounter", { current: step + 1, total: stepCount })}
                  </span>
                </div>
                <DialogDescription>{t("pageSubtitle")}</DialogDescription>
              </DialogHeader>

              <Stepper labels={stepLabels} current={step} />

              {/* Keyed remount per step: tw-animate-css gives a light slide+fade, CSS only. */}
              <div key={step} className="animate-in fade-in-0 slide-in-from-right-2 duration-200">
                {step === 0 ? (
                  <div className="space-y-4">
                    <StepIntro title={t("company.title")} description={t("company.description")} />
                    <TextField
                      label={t("company.name")}
                      placeholder={t("company.namePlaceholder")}
                      autoFocus
                      error={errors.companyName?.message}
                      {...register("companyName")}
                    />
                    <Controller
                      control={form.control}
                      name="sector"
                      render={({ field }) => (
                        <SelectField
                          id="onboarding-sector"
                          label={t("company.sector")}
                          placeholder={t("company.sectorPlaceholder")}
                          options={sectorOptions}
                          value={field.value || undefined}
                          onValueChange={field.onChange}
                          error={errors.sector?.message}
                        />
                      )}
                    />
                    <TextField
                      label={t("company.contactEmail")}
                      type="email"
                      autoComplete="off"
                      placeholder={t("company.contactEmailPlaceholder")}
                      error={errors.contactEmail?.message}
                      {...register("contactEmail")}
                    />
                  </div>
                ) : null}

                {step === 1 ? (
                  <div className="space-y-4">
                    <StepIntro
                      title={t("facility.title")}
                      description={t("facility.description")}
                    />
                    <TextField
                      label={t("facility.name")}
                      placeholder={t("facility.namePlaceholder")}
                      error={errors.facilityName?.message}
                      {...register("facilityName")}
                    />
                    <TextField
                      label={t("facility.location")}
                      placeholder={t("facility.locationPlaceholder")}
                      error={errors.facilityLocation?.message}
                      {...register("facilityLocation")}
                    />
                  </div>
                ) : null}

                {step === 2 ? (
                  <div className="space-y-4">
                    <StepIntro title={t("year.title")} description={t("year.description")} />
                    {hasFacility ? (
                      <TextField
                        label={t("year.label")}
                        inputMode="numeric"
                        placeholder={String(new Date().getFullYear())}
                        error={errors.year?.message}
                        {...register("year")}
                      />
                    ) : (
                      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                        {t("year.needsFacility")}
                      </p>
                    )}
                  </div>
                ) : null}

                {step === 3 ? (
                  <div className="space-y-4">
                    <StepIntro title={t("user.title")} description={t("user.description")} />
                    <TextField
                      label={t("user.email")}
                      type="email"
                      autoComplete="off"
                      placeholder={t("user.emailPlaceholder")}
                      error={errors.userEmail?.message}
                      {...register("userEmail")}
                    />
                    <div className="grid gap-2">
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <TextField
                            label={t("user.password")}
                            // Plain text so the admin can read the password they will share.
                            type="text"
                            autoComplete="off"
                            error={errors.userPassword?.message}
                            {...register("userPassword")}
                          />
                        </div>
                        <Button type="button" variant="outline" onClick={fillGeneratedPassword}>
                          <RefreshCw className="size-4" aria-hidden />
                          {t("user.generate")}
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground">{t("user.passwordHelp")}</p>
                    </div>
                  </div>
                ) : null}
              </div>

              {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}

              <Separator />

              <div className="flex items-center justify-between gap-2">
                {step === 0 ? (
                  <Button type="button" variant="ghost" onClick={requestClose}>
                    {t("cancel")}
                  </Button>
                ) : (
                  <Button type="button" variant="ghost" onClick={back} disabled={isSubmitting}>
                    <ArrowLeft className="size-4" aria-hidden />
                    {t("back")}
                  </Button>
                )}

                {/* Distinct keys, so React mounts a fresh submit node instead of reusing the
                    "Siguiente" node and only flipping its type. A pointer sequence that straddles
                    the step change would otherwise land a submit on what the user clicked as
                    "Siguiente"; the reused node also let that hide behind a button that never
                    disabled. Separate identities keep the last step's submit its own control. */}
                {isLastStep ? (
                  <Button key="submit" type="submit" loading={isSubmitting}>
                    {t("submit")}
                  </Button>
                ) : (
                  <Button key="next" type="button" onClick={next}>
                    {t("next")}
                    <ArrowRight className="size-4" aria-hidden />
                  </Button>
                )}
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Discard confirm: a synchronous local decision, so a plain controlled AlertDialog
          rather than ConfirmActionDialog (which exists for async pending actions). */}
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("discard.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("discard.body")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setConfirmDiscard(false)}>
              {t("discard.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmDiscard(false);
                onClose();
              }}
            >
              {t("discard.confirm")}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Stepper({ labels, current }: { labels: string[]; current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {labels.map((label, index) => {
        const Icon = STEP_ICONS[index] ?? Building2;
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full border text-xs",
                active && "border-primary bg-primary text-primary-foreground",
                done && "border-primary/50 bg-primary/10 text-primary",
                !active && !done && "text-muted-foreground",
              )}
            >
              {done ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <Icon className="size-3.5" aria-hidden />
              )}
            </span>
            {/* At dialog width on a phone, four labels wrap into noise: only the active step
                keeps its label below sm. */}
            <span
              className={cn(
                "text-sm",
                active ? "font-medium text-foreground" : "hidden text-muted-foreground sm:inline",
              )}
            >
              {label}
            </span>
            {index < labels.length - 1 ? (
              <span className="mx-1 hidden h-px w-4 bg-border sm:block" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function StepIntro({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-1">
      <h2 className="font-medium">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function WizardSummary({
  result,
  onRestart,
  onClose,
}: {
  result: OnboardingResult;
  onRestart: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("admin.onboarding.summary");

  return (
    <div className="space-y-4">
      <DialogHeader>
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>
              {t("subtitle", { company: result.companyName })}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <ul className="space-y-2">
        <ResultLine ok label={t("companyCreated", { company: result.companyName })} />

        {result.facility ? (
          <ResultLine ok label={t("facilityCreated", { facility: result.facility.name })} />
        ) : result.facilityError ? (
          <ResultLine label={t("facilityFailed", { error: result.facilityError })} />
        ) : (
          <ResultLine muted label={t("facilitySkipped")} />
        )}

        {result.year ? (
          <ResultLine ok label={t("yearCreated", { year: String(result.year.year) })} />
        ) : result.yearError ? (
          <ResultLine label={t("yearFailed", { error: result.yearError })} />
        ) : (
          <ResultLine muted label={t("yearSkipped")} />
        )}

        {result.user ? (
          <ResultLine ok label={t("userCreated", { email: result.user.email })} />
        ) : result.userError ? (
          <ResultLine label={t("userFailed", { error: result.userError })} />
        ) : (
          <ResultLine muted label={t("userSkipped")} />
        )}
      </ul>

      {result.user ? (
        <CredentialsBox email={result.user.email} password={result.user.password} />
      ) : null}

      <Separator />

      <DialogFooter className="sm:justify-start">
        <Button asChild>
          <Link href={`/admin/companies/${result.companyId}/company`} onClick={onClose}>
            {t("openCompany")}
          </Link>
        </Button>
        <Button variant="outline" onClick={onRestart}>
          {t("createAnother")}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t("close")}
        </Button>
      </DialogFooter>
    </div>
  );
}

function ResultLine({
  label,
  ok,
  muted,
}: {
  label: string;
  ok?: boolean;
  muted?: boolean;
}) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? (
        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      ) : muted ? (
        <span
          className="mt-2 ml-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground"
          aria-hidden
        />
      ) : (
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
      )}
      <span className={cn(muted && "text-muted-foreground", !ok && !muted && "text-destructive")}>
        {label}
      </span>
    </li>
  );
}
