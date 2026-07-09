"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TextField } from "@/components/form/text-field";
import { useOnboarding } from "../hooks/use-onboarding";

export function OnboardingForm() {
  const t = useTranslations("onboarding");
  const { form, onSubmit, isSubmitting, serverError } = useOnboarding();
  const {
    register,
    formState: { errors },
  } = form;

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
            <TextField
              label={t("sector")}
              placeholder={t("sectorPlaceholder")}
              error={errors.sector?.message}
              {...register("sector")}
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
        <Button type="submit" disabled={isSubmitting}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
