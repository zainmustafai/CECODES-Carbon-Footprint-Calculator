"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DecimalField } from "@/components/form/decimal-field";
import { useHydrated } from "@/hooks/use-form-submit";
import { useCompanyTargetForm } from "../hooks/use-company-target-form";

// The company's single reduction goal: one percentage, measured against its first reported
// year. Lives on the profile screen (not Data Entry) because it is a company-wide setting, not
// something re-entered per Sede/Año/Alcance the way the old per-scope tonnes target was.
export function CompanyTargetForm({
  companyId,
  firstReportedYear,
  initialReductionPct,
}: {
  companyId: string;
  /** Null when the company has not created any reporting year yet. */
  firstReportedYear: number | null;
  initialReductionPct: string;
}) {
  const t = useTranslations("company.target");
  // Pre-hydration a submit is native, not React: see useHydrated in @/hooks/use-form-submit.
  const hydrated = useHydrated();

  const { form, onSubmit, serverError, isSubmitting } = useCompanyTargetForm({
    companyId,
    initialReductionPct,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {firstReportedYear !== null
            ? t("subtitle", { year: String(firstReportedYear) })
            : t("subtitleNoBaseline")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {firstReportedYear === null ? (
          <p className="text-sm text-muted-foreground">{t("noBaselineBody")}</p>
        ) : (
          <form method="post" onSubmit={onSubmit} className="space-y-4">
            <div className="max-w-40">
              <DecimalField
                label={t("label")}
                unit="%"
                error={form.formState.errors.reductionPct?.message}
                {...form.register("reductionPct")}
              />
            </div>

            {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}

            <div className="flex justify-end">
              <Button type="submit" disabled={!hydrated} loading={isSubmitting}>
                {t("save")}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
