"use client";

import { useState } from "react";
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
import { useGridFactorForm } from "../hooks/use-grid-factor-form";

type GridFactorDialogProps = {
  // Present in edit mode. The year is the key, so it is read-only there.
  gridFactor?: { year: string; factor: string; source: string };
};

export function GridFactorDialog({ gridFactor }: GridFactorDialogProps) {
  const t = useTranslations("admin.factors.grid");
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(gridFactor);

  const { form, onSubmit, isSubmitting, serverError } = useGridFactorForm({
    gridFactor,
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
            aria-label={`${t("edit")}: ${gridFactor?.year}`}
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
        <form onSubmit={onSubmit} noValidate>
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
            <DecimalField
              label={t("factor")}
              unit={t("factorUnit")}
              {...form.register("factor")}
              error={errors.factor?.message}
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
            <Button type="submit" loading={isSubmitting}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
