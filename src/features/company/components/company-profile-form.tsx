"use client";

import { Controller } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectField, type SelectFieldOption } from "@/components/form/select-field";
import { TextField } from "@/components/form/text-field";
import { SECTORS, isKnownSector } from "@/lib/sectors";
import { useCompanyProfileForm } from "../hooks/use-company-profile-form";

export function CompanyProfileForm({
  companyId,
  name,
  sector,
  contactEmail,
}: {
  companyId: string;
  name: string;
  sector: string | null;
  contactEmail: string | null;
}) {
  const t = useTranslations("company");
  const tSectors = useTranslations("company.sectors");

  const { form, onSubmit, serverError, isSubmitting } = useCompanyProfileForm({
    companyId,
    defaults: {
      name,
      sector: sector ?? "",
      contactEmail: contactEmail ?? "",
    },
  });

  const options: SelectFieldOption[] = SECTORS.map((slug) => ({
    value: slug,
    label: tSectors(slug),
  }));

  // A company onboarded before the curated list existed may hold arbitrary text. Offer it
  // verbatim rather than silently dropping it the first time someone saves this form.
  if (sector && !isKnownSector(sector)) {
    options.unshift({ value: sector, label: sector });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profileTitle")}</CardTitle>
        <CardDescription>{t("profileSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <TextField
              label={t("name")}
              placeholder={t("namePlaceholder")}
              error={form.formState.errors.name?.message}
              {...form.register("name")}
            />

            <Controller
              control={form.control}
              name="sector"
              render={({ field }) => (
                <SelectField
                  id="company-sector"
                  label={t("sector")}
                  placeholder={t("sectorPlaceholder")}
                  options={options}
                  value={field.value || undefined}
                  onValueChange={field.onChange}
                  error={form.formState.errors.sector?.message}
                />
              )}
            />

            <TextField
              label={t("contactEmail")}
              type="email"
              autoComplete="email"
              placeholder={t("contactEmailPlaceholder")}
              startIcon={<Mail />}
              error={form.formState.errors.contactEmail?.message}
              {...form.register("contactEmail")}
            />
          </div>

          {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}

          <div className="flex justify-end">
            <Button type="submit" loading={isSubmitting}>
              {t("save")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
