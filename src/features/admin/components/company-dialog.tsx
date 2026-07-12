"use client";

import * as React from "react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Controller } from "react-hook-form";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TextField } from "@/components/form/text-field";
import { SelectField, type SelectFieldOption } from "@/components/form/select-field";
import { SECTORS, isKnownSector } from "@/lib/sectors";
import { useCompanyForm } from "../hooks/use-company-form";

type CompanyDialogProps = {
  // Present in edit mode. Absent means create mode.
  company?: { id: string; name: string; sector: string | null };
  // A custom trigger, e.g. a DropdownMenuItem from the row actions. When omitted the dialog
  // renders its own "Nueva empresa" button, which is how the screen header opens create mode.
  trigger?: React.ReactNode;
};

// One Dialog handling create AND edit. It manages its own open state and, when a custom
// trigger is supplied, is opened from the row-actions menu. The menu item passes
// event.preventDefault() on select so the menu does not tear the trigger down before the
// dialog registers as open.
export function CompanyDialog({ company, trigger }: CompanyDialogProps) {
  const t = useTranslations("admin.companies");
  const tSectors = useTranslations("company.sectors");
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(company);

  const { form, onSubmit, isSubmitting, serverError } = useCompanyForm({
    company,
    onDone: () => setOpen(false),
  });

  const sectorFieldId = company ? `company-sector-${company.id}` : "company-sector-new";

  const sectorOptions: SelectFieldOption[] = SECTORS.map((slug) => ({
    value: slug,
    label: tSectors(slug),
  }));
  // In edit mode a stored sector that is not a known slug is a legacy free-text value. Keep
  // it as a verbatim option so saving cannot silently discard it.
  const storedSector = company?.sector?.trim();
  if (storedSector && !isKnownSector(storedSector)) {
    sectorOptions.unshift({ value: storedSector, label: storedSector });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="size-4" aria-hidden />
            {t("create")}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent>
        <form onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>{isEdit ? t("editTitle") : t("createTitle")}</DialogTitle>
            <DialogDescription>{t("dialogSubtitle")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-6">
            <TextField
              label={t("name")}
              placeholder={t("namePlaceholder")}
              {...form.register("name")}
              error={form.formState.errors.name?.message}
            />
            <Controller
              control={form.control}
              name="sector"
              render={({ field }) => (
                <SelectField
                  id={sectorFieldId}
                  label={t("sector")}
                  placeholder={t("sectorPlaceholder")}
                  options={sectorOptions}
                  value={field.value || undefined}
                  onValueChange={field.onChange}
                  error={form.formState.errors.sector?.message}
                />
              )}
            />
            {serverError ? (
              <p className="text-sm text-destructive">{serverError}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="submit" loading={isSubmitting}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
