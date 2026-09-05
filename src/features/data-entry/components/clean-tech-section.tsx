"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Plus, Sprout, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TextField } from "@/components/form/text-field";
import { SelectField } from "@/components/form/select-field";
import { Controller } from "react-hook-form";
import { useToastAction } from "@/hooks/use-toast-action";
import { useHydrated } from "@/hooks/use-form-submit";
import { removeCleanTechAction } from "../actions/clean-tech";
import { useCleanTechForm, type CleanTechRowVM } from "../hooks/use-clean-tech-form";

// "Datos sobre tecnologías más limpias y buenas prácticas" (CECODES, 2026-07-24).
//
// A deliberately OPEN reporting table: every field is free text, nothing comes from the factor
// library, and nothing here touches any total. The card says so out loud, because a user who
// sees numbers next to their emissions data will otherwise assume they add up somewhere.

const SCOPE_LABEL: Record<string, string> = {
  SCOPE_1: "Alcance 1",
  SCOPE_2: "Alcance 2",
  SCOPE_3: "Alcance 3",
};

// Radix Select cannot represent an empty-string item, so "no scope" travels as this sentinel
// inside the select only; the form value stays "".
const NO_SCOPE = "NONE";

export function CleanTechSection({
  reportingYearId,
  rows,
  scope,
}: {
  reportingYearId: string;
  rows: CleanTechRowVM[];
  /** The scope tab this instance renders in. Filters `rows` to this scope (plus rows with no
   *  scope yet, a transitional state until edited) and seeds new rows with it. */
  scope: "SCOPE_1" | "SCOPE_2" | "SCOPE_3";
}) {
  const t = useTranslations("dataEntry.cleanTech");
  const te = useTranslations("dataEntry.errors");
  const { isPending, run } = useToastAction();
  // null = closed, "new" = adding, a row = editing that row.
  const [editing, setEditing] = useState<CleanTechRowVM | "new" | null>(null);

  const remove = (row: CleanTechRowVM) =>
    run(() => removeCleanTechAction({ id: row.id, reportingYearId }), {
      loading: t("removing"),
      success: t("removed"),
      errorMessage: (key) => te(key),
    });

  const scopedRows = rows.filter((row) => row.scope === scope || row.scope === null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-0.5">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sprout className="size-4 text-chart-1" aria-hidden />
            {t("title")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
          <Plus className="size-4" aria-hidden />
          {t("add")}
        </Button>
      </CardHeader>
      <CardContent>
        {scopedRows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.scope")}</TableHead>
                  <TableHead>{t("columns.element")}</TableHead>
                  <TableHead className="text-right">{t("columns.quantity")}</TableHead>
                  <TableHead>{t("columns.unit")}</TableHead>
                  <TableHead className="w-20" aria-label={t("columns.actions")} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {scopedRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">
                      {row.scope ? SCOPE_LABEL[row.scope] : "-"}
                    </TableCell>
                    <TableCell className="max-w-64 truncate" title={row.element}>
                      {row.element}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.quantity ?? "-"}
                    </TableCell>
                    <TableCell>{row.unit ?? "-"}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t("edit")}
                          onClick={() => setEditing(row)}
                          disabled={isPending}
                        >
                          <Pencil className="size-4" aria-hidden />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t("remove")}
                          onClick={() => remove(row)}
                          disabled={isPending}
                        >
                          <Trash2 className="size-4 text-destructive" aria-hidden />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {editing !== null ? (
        <CleanTechDialog
          reportingYearId={reportingYearId}
          row={editing === "new" ? null : editing}
          defaultScope={scope}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Card>
  );
}

// Mounted only while open, so RHF defaultValues re-seed per row and per add. That is what makes
// one dialog serve both add and edit without a reset dance.
function CleanTechDialog({
  reportingYearId,
  row,
  defaultScope,
  onClose,
}: {
  reportingYearId: string;
  row: CleanTechRowVM | null;
  defaultScope: "SCOPE_1" | "SCOPE_2" | "SCOPE_3";
  onClose: () => void;
}) {
  const t = useTranslations("dataEntry.cleanTech");
  // Pre-hydration a submit is native, not React: see useHydrated in @/hooks/use-form-submit.
  const hydrated = useHydrated();
  const { form, onSubmit, isSubmitting, serverError } = useCleanTechForm({
    reportingYearId,
    row,
    defaultScope,
    onDone: onClose,
  });

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <form method="post" onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>{row ? t("editTitle") : t("addTitle")}</DialogTitle>
            <DialogDescription>{t("dialogSubtitle")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-6 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="scope"
              render={({ field }) => (
                <SelectField
                  id="clean-tech-scope"
                  label={t("columns.scope")}
                  options={[
                    { value: NO_SCOPE, label: t("noScope") },
                    { value: "SCOPE_1", label: SCOPE_LABEL.SCOPE_1 },
                    { value: "SCOPE_2", label: SCOPE_LABEL.SCOPE_2 },
                    { value: "SCOPE_3", label: SCOPE_LABEL.SCOPE_3 },
                  ]}
                  value={field.value === "" ? NO_SCOPE : field.value}
                  onValueChange={(value) =>
                    field.onChange(value === NO_SCOPE ? "" : value)
                  }
                />
              )}
            />
            <div className="sm:col-span-2">
              <TextField
                label={t("columns.element")}
                placeholder={t("columns.elementPlaceholder")}
                {...form.register("element")}
                error={form.formState.errors.element?.message}
              />
            </div>
            <TextField
              label={t("columns.quantity")}
              inputMode="decimal"
              {...form.register("quantity")}
              error={form.formState.errors.quantity?.message}
            />
            <TextField
              label={t("columns.unit")}
              {...form.register("unit")}
              error={form.formState.errors.unit?.message}
            />
            {serverError ? (
              <p className="text-sm text-destructive sm:col-span-2">{serverError}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!hydrated} loading={isSubmitting}>
              {row ? t("save") : t("add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
