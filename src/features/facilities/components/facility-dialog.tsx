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
import { useFacilityForm } from "../hooks/use-facility-form";

type FacilityDialogProps = {
  companyId: string;
  facility?: { id: string; name: string; location: string };
};

export function FacilityDialog({ companyId, facility }: FacilityDialogProps) {
  const t = useTranslations("facilities");
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(facility);

  const { form, onSubmit, isSubmitting, serverError } = useFacilityForm({
    companyId,
    facility,
    onDone: () => setOpen(false),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon-sm" aria-label={`${t("edit")}: ${facility?.name}`}>
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
              label={t("name")}
              placeholder={t("namePlaceholder")}
              {...form.register("name")}
              error={form.formState.errors.name?.message}
            />
            <TextField
              label={t("location")}
              placeholder={t("locationPlaceholder")}
              {...form.register("location")}
              error={form.formState.errors.location?.message}
            />
            {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
          </div>

          <DialogFooter>
            <Button type="submit" loading={isSubmitting}>
              {isEdit ? t("save") : t("add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
