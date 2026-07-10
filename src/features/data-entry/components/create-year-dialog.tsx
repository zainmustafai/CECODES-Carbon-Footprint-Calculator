"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarPlus } from "lucide-react";
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
import { resolveGwpSet } from "@/lib/gwp";
import { useCreateYear } from "../hooks/use-create-year";

type CreateYearDialogProps = {
  facilityId: string;
  basePath: string;
  variant?: "outline" | "default";
};

export function CreateYearDialog({
  facilityId,
  basePath,
  variant = "outline",
}: CreateYearDialogProps) {
  const t = useTranslations("dataEntry.year");
  const [open, setOpen] = useState(false);
  const { form, onSubmit, isSubmitting, serverError } = useCreateYear({
    facilityId,
    basePath,
    onDone: () => setOpen(false),
  });

  const year = form.watch("year");
  const gwpSet = Number.isInteger(Number(year)) ? resolveGwpSet(Number(year)) : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm">
          <CalendarPlus className="size-4" aria-hidden />
          {t("create")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>{t("createTitle")}</DialogTitle>
            <DialogDescription>{t("createSubtitle")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-6">
            <TextField
              label={t("yearLabel")}
              type="number"
              inputMode="numeric"
              {...form.register("year", { valueAsNumber: true })}
              error={form.formState.errors.year?.message}
            />
            {gwpSet ? (
              <p className="text-xs text-muted-foreground">{t("gwpNote", { gwp: gwpSet })}</p>
            ) : null}
            {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
