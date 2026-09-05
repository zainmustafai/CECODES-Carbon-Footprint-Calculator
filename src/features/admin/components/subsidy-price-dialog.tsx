"use client";

import { useState } from "react";
import { Controller } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Pencil, Plus } from "lucide-react";
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
import { DecimalField } from "@/components/form/decimal-field";
import { SelectField } from "@/components/form/select-field";
import { useHydrated } from "@/hooks/use-form-submit";
import { useSubsidyPriceForm, type SubsidyFuel } from "../hooks/use-subsidy-price-form";

type SubsidyPriceDialogProps = {
  // Present in edit mode. Year and fuel are the key together, so both are read-only there.
  subsidyPrice?: {
    year: string;
    fuel: SubsidyFuel;
    pricePerGallonCop: string;
    source: string;
  };
};

export function SubsidyPriceDialog({ subsidyPrice }: SubsidyPriceDialogProps) {
  const t = useTranslations("admin.factors.subsidy");
  // Pre-hydration a submit is native, not React: see useHydrated in @/hooks/use-form-submit.
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(subsidyPrice);
  const fuelOptions = [
    { value: "GASOLINE", label: t("fuelGasoline") },
    { value: "DIESEL", label: t("fuelDiesel") },
  ];
  // Two rows now share a year, so the trigger's accessible name has to name the fuel too.
  const editedFuel = subsidyPrice
    ? t(subsidyPrice.fuel === "GASOLINE" ? "fuelGasoline" : "fuelDiesel")
    : "";

  const { form, onSubmit, isSubmitting, serverError } = useSubsidyPriceForm({
    subsidyPrice,
    onDone: () => setOpen(false),
  });
  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${t("edit")}: ${editedFuel} ${subsidyPrice?.year}`}
          >
            <Pencil className="size-4 text-muted-foreground" aria-hidden />
          </Button>
        ) : (
          <Button>
            <Plus className="size-4" aria-hidden />
            {t("add")}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent>
        <form method="post" onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>{isEdit ? t("editTitle") : t("addTitle")}</DialogTitle>
            <DialogDescription>{t("dialogSubtitle")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-6">
            <TextField
              label={t("year")}
              type="number"
              inputMode="numeric"
              readOnly={isEdit}
              {...form.register("year")}
              error={errors.year?.message}
            />
            <Controller
              control={form.control}
              name="fuel"
              render={({ field }) => (
                <SelectField
                  id="subsidy-fuel"
                  label={t("fuel")}
                  options={fuelOptions}
                  value={field.value}
                  onValueChange={field.onChange}
                  // The fuel is half the key: switching it would address a different row, so
                  // that is a create, not an edit.
                  disabled={isEdit}
                  error={errors.fuel?.message}
                />
              )}
            />
            {/* The year and the fuel are read-only while editing because together they ARE the
                row's key. Two disabled controls with no explanation read as a bug, so say why. */}
            {isEdit ? (
              <p className="text-muted-foreground text-xs">{t("fuelLocked")}</p>
            ) : null}
            <DecimalField
              label={t("price")}
              unit={t("priceUnit")}
              {...form.register("pricePerGallonCop")}
              error={errors.pricePerGallonCop?.message}
            />
            <TextField
              label={t("source")}
              placeholder={t("sourcePlaceholder")}
              {...form.register("source")}
              error={errors.source?.message}
            />
            {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!hydrated} loading={isSubmitting}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
