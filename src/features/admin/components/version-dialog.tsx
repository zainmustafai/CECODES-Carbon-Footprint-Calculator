"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TextField } from "@/components/form/text-field";
import { useVersionForm } from "../hooks/use-version-form";

export function VersionDialog() {
  const t = useTranslations("admin.factors.versions");
  const [open, setOpen] = useState(false);
  const { form, onSubmit, isSubmitting, serverError } = useVersionForm({
    onDone: () => setOpen(false),
  });
  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" aria-hidden />
          {t("create")}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <form onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>{t("createTitle")}</DialogTitle>
            <DialogDescription>{t("createSubtitle")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-6 sm:grid-cols-2">
            <TextField
              label={t("version")}
              placeholder={t("versionPlaceholder")}
              {...form.register("version")}
              error={errors.version?.message}
            />
            <TextField
              label={t("date")}
              type="date"
              {...form.register("date")}
              error={errors.date?.message}
            />
            <TextField
              label={t("preparedBy")}
              {...form.register("preparedBy")}
              error={errors.preparedBy?.message}
            />
            <TextField
              label={t("reviewedBy")}
              {...form.register("reviewedBy")}
              error={errors.reviewedBy?.message}
            />
            <TextField
              label={t("authorizedBy")}
              {...form.register("authorizedBy")}
              error={errors.authorizedBy?.message}
            />
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="version-description">{t("description")}</Label>
              <Textarea
                id="version-description"
                placeholder={t("descriptionPlaceholder")}
                {...form.register("description")}
              />
            </div>
            {serverError ? (
              <p className="text-sm text-destructive sm:col-span-2">{serverError}</p>
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
