"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { ConfirmActionDialog } from "@/components/feedback/confirm-action-dialog";
import { Button } from "@/components/ui/button";
import { useToastAction } from "@/hooks/use-toast-action";
import { deleteReportingYear } from "@/features/data-entry/actions/reporting-years";

export type YearChip = { id: string; year: number; entryCount: number };

// The reporting years of one facility, each removable. Deleting a year is the only way to
// free a facility for deletion, so the two live on the same card.
//
// The confirmation states the exact number of activity records that will disappear. A
// destructive confirm that says only "this cannot be undone" tells the user nothing they did
// not already assume.
export function YearChips({
  facilityName,
  years,
}: {
  facilityName: string;
  years: YearChip[];
}) {
  const t = useTranslations("facilities");
  const td = useTranslations("facilities.yearDelete");
  const te = useTranslations("facilities.errors");
  const tt = useTranslations("facilities.toasts");
  const { isPending, run } = useToastAction();

  if (years.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("yearCount", { count: 0 })}</p>;
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{t("yearsTitle")}</p>
      <ul className="flex flex-wrap gap-1.5">
        {years.map((year) => (
          <li key={year.id}>
            <span className="inline-flex items-center gap-0.5 rounded-full border bg-muted/40 py-0.5 pr-0.5 pl-2.5 text-xs tabular-nums">
              {year.year}
              <ConfirmActionDialog
                trigger={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="rounded-full"
                    // ICU formats a bare number with grouping, so the year is passed as a string.
                    aria-label={t("deleteYear", { year: String(year.year) })}
                    disabled={isPending}
                  >
                    <X className="size-3 text-muted-foreground" aria-hidden />
                  </Button>
                }
                title={td("title", { year: String(year.year) })}
                description={td("body", {
                  year: String(year.year),
                  entries: year.entryCount,
                  facility: facilityName,
                })}
                cancelLabel={td("cancel")}
                confirmLabel={td("confirm")}
                pending={isPending}
                onConfirm={() =>
                  run(() => deleteReportingYear({ reportingYearId: year.id }), {
                    loading: tt("deletingYear"),
                    success: tt("yearDeleted"),
                    errorMessage: (key) => te(key),
                  })
                }
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
