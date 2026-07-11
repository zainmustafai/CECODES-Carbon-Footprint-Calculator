"use client";

import { Controller } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectField } from "@/components/form/select-field";
import { TextField } from "@/components/form/text-field";
import { SECTORS } from "@/lib/sectors";
import { useOnboarding } from "../hooks/use-onboarding";

export function OnboardingForm() {
  const t = useTranslations("onboarding");
  const tSectors = useTranslations("company.sectors");
  const { form, onSubmit, isSubmitting, serverError } = useOnboarding();
  const {
    register,
    formState: { errors },
  } = form;

  // A curated list, not free text: a typo here becomes a permanent label on every report.
  const sectorOptions = SECTORS.map((slug) => ({ value: slug, label: tSectors(slug) }));

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("companySection")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <TextField
              label={t("companyName")}
              placeholder={t("companyNamePlaceholder")}
              error={errors.companyName?.message}
              {...register("companyName")}
            />
            <Controller
              control={form.control}
              name="sector"
              render={({ field }) => (
                <SelectField
                  id="onboarding-sector"
                  label={t("sector")}
                  placeholder={t("sectorPlaceholder")}
                  options={sectorOptions}
                  value={field.value || undefined}
                  onValueChange={field.onChange}
                  error={errors.sector?.message}
                />
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("facilitySection")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <TextField
              label={t("facilityName")}
              placeholder={t("facilityNamePlaceholder")}
              error={errors.facilityName?.message}
              {...register("facilityName")}
            />
            <TextField
              label={t("facilityLocation")}
              placeholder={t("facilityLocationPlaceholder")}
              error={errors.facilityLocation?.message}
              {...register("facilityLocation")}
            />
          </CardContent>
        </Card>
      </div>

      {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}

      <div className="flex justify-end">
        <Button type="submit" loading={isSubmitting}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
