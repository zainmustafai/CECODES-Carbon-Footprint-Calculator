"use client";

import { useState } from "react";
import Link from "next/link";
import { Controller } from "react-hook-form";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  MapPin,
  RefreshCw,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TextField } from "@/components/form/text-field";
import { SelectField, type SelectFieldOption } from "@/components/form/select-field";
import { SECTORS } from "@/lib/sectors";
import { cn } from "@/lib/utils";
import { useCompanyOnboarding, type OnboardingResult } from "../hooks/use-company-onboarding";

const STEP_ICONS = [Building2, MapPin, UserPlus] as const;

export function CompanyOnboardingWizard() {
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

  const sectorOptions: SelectFieldOption[] = SECTORS.map((slug) => ({
    value: slug,
    label: tSectors(slug),
  }));

  const {
    register,
    formState: { errors },
  } = form;

  if (result) {
    return <OnboardingSummary result={result} onRestart={restart} />;
  }

  const stepLabels = [t("steps.company"), t("steps.facility"), t("steps.user")];

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{t("title")}</CardTitle>
          <span className="text-sm text-muted-foreground tabular-nums">
            {t("stepCounter", { current: step + 1, total: stepCount })}
          </span>
        </div>
        <Stepper labels={stepLabels} current={step} />
      </CardHeader>

      <CardContent>
        {/* The whole wizard is one form; only the current step's fields are visible, and the
            submit only fires from the last step. */}
        <form onSubmit={onSubmit} noValidate className="space-y-6">
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
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              <StepIntro title={t("facility.title")} description={t("facility.description")} />
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
                      // Plain text so the admin can read the password they are about to share.
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

          {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}

          <Separator />

          <div className="flex items-center justify-between gap-2">
            {step === 0 ? (
              <Button asChild type="button" variant="ghost">
                <Link href="/admin/companies">{t("cancel")}</Link>
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
      </CardContent>
    </Card>
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
              {done ? <Check className="size-3.5" aria-hidden /> : <Icon className="size-3.5" aria-hidden />}
            </span>
            <span
              className={cn(
                "text-sm",
                active ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {index < labels.length - 1 ? (
              <span className="mx-1 hidden h-px w-6 bg-border sm:block" aria-hidden />
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

function OnboardingSummary({
  result,
  onRestart,
}: {
  result: OnboardingResult;
  onRestart: () => void;
}) {
  const t = useTranslations("admin.onboarding.summary");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="size-5" aria-hidden />
          </span>
          <div>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("subtitle", { company: result.companyName })}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <ul className="space-y-2">
          <ResultLine ok label={t("companyCreated", { company: result.companyName })} />

          {result.facility ? (
            <ResultLine ok label={t("facilityCreated", { facility: result.facility.name })} />
          ) : result.facilityError ? (
            <ResultLine label={t("facilityFailed", { error: result.facilityError })} />
          ) : (
            <ResultLine muted label={t("facilitySkipped")} />
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

        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/admin/companies/${result.companyId}/company`}>
              {t("openCompany")}
            </Link>
          </Button>
          <Button variant="outline" onClick={onRestart}>
            {t("createAnother")}
          </Button>
          <Button asChild variant="ghost">
            <Link href="/admin/companies">{t("backToList")}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
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
        <span className="mt-2 ml-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
      ) : (
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
      )}
      <span className={cn(muted && "text-muted-foreground", !ok && !muted && "text-destructive")}>
        {label}
      </span>
    </li>
  );
}

function CredentialsBox({ email, password }: { email: string; password: string }) {
  const t = useTranslations("admin.onboarding.summary");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${email}\n${password}`);
      setCopied(true);
      toast.success(t("copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
      <p className="text-sm font-medium">{t("credentialsTitle")}</p>
      <dl className="grid gap-1 text-sm">
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 text-muted-foreground">{t("email")}</dt>
          <dd className="font-mono break-all">{email}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 text-muted-foreground">{t("password")}</dt>
          <dd className="font-mono break-all">{password}</dd>
        </div>
      </dl>
      <div className="flex items-center justify-between gap-2 pt-1">
        <p className="text-xs text-muted-foreground">{t("credentialsHelp")}</p>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? t("copiedShort") : t("copy")}
        </Button>
      </div>
    </div>
  );
}
