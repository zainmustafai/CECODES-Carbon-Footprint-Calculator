"use client";

import { Controller } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Globe, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectField, type SelectFieldOption } from "@/components/form/select-field";
import { TextField } from "@/components/form/text-field";
import { SECTORS, isKnownSector } from "@/lib/sectors";
import { useHydrated } from "@/hooks/use-form-submit";
import { useCompanyProfileForm } from "../hooks/use-company-profile-form";

export function CompanyProfileForm({
  companyId,
  name,
  sector,
  contactEmail,
  nit,
  employeeCount,
  contactName,
  contactRole,
  contactPhone,
  website,
}: {
  companyId: string;
  name: string;
  sector: string | null;
  contactEmail: string | null;
  nit: string | null;
  employeeCount: number | null;
  contactName: string | null;
  contactRole: string | null;
  contactPhone: string | null;
  website: string | null;
}) {
  const t = useTranslations("company");
  const tSectors = useTranslations("company.sectors");
  // Pre-hydration a submit is native, not React: see useHydrated in @/hooks/use-form-submit.
  const hydrated = useHydrated();

  const { form, onSubmit, serverError, isSubmitting } = useCompanyProfileForm({
    companyId,
    defaults: {
      name,
      sector: sector ?? "",
      contactEmail: contactEmail ?? "",
      nit: nit ?? "",
      // An Int column, so a genuine 0 must survive as "0"; only a null column is an empty input.
      employeeCount: employeeCount === null ? "" : String(employeeCount),
      contactName: contactName ?? "",
      contactRole: contactRole ?? "",
      contactPhone: contactPhone ?? "",
      website: website ?? "",
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
        <form method="post" onSubmit={onSubmit} className="space-y-4">
          {/* Two columns at sm, three only at xl: three ~220px columns at tablet width crush
              the sector select and the email. */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

            <TextField
              label={t("nit")}
              error={form.formState.errors.nit?.message}
              {...form.register("nit")}
            />

            {/* type="text" with a numeric keypad, not type="number": the schema validates the
                digits itself, and a number input would let the browser accept "1e3". */}
            <TextField
              label={t("employeeCount")}
              inputMode="numeric"
              error={form.formState.errors.employeeCount?.message}
              {...form.register("employeeCount")}
            />

            <TextField
              label={t("contactName")}
              autoComplete="name"
              error={form.formState.errors.contactName?.message}
              {...form.register("contactName")}
            />

            <TextField
              label={t("contactRole")}
              autoComplete="organization-title"
              error={form.formState.errors.contactRole?.message}
              {...form.register("contactRole")}
            />

            <TextField
              label={t("contactPhone")}
              type="tel"
              autoComplete="tel"
              startIcon={<Phone />}
              error={form.formState.errors.contactPhone?.message}
              {...form.register("contactPhone")}
            />

            {/* Not type="url": native constraint validation would block the submit on
                "empresa.com", and the header prints whatever the company writes. */}
            <TextField
              label={t("website")}
              autoComplete="url"
              startIcon={<Globe />}
              error={form.formState.errors.website?.message}
              {...form.register("website")}
            />
          </div>

          {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}

          <div className="flex justify-end">
            <Button type="submit" disabled={!hydrated} loading={isSubmitting}>
              {t("save")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
