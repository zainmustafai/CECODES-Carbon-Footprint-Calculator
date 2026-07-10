"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { SourceVM } from "../lib/types";
import { useReportedCount } from "../hooks/use-reported-count";
import { useSourceActions } from "../hooks/use-source-actions";
import { ValueField } from "./value-field";
import { DeleteSourceButton } from "./delete-source-button";

// Alcance 2: twelve monthly values, Enero to Diciembre.
// The grid is 1 column on a phone, 3 on a tablet, 6 on a laptop. Twelve on one line would
// force horizontal scanning on every viewport and win on none.
export function MonthlySourceRow({ source }: { source: SourceVM }) {
  const t = useTranslations("dataEntry.source");
  const tm = useTranslations("dataEntry.months");
  const [open, setOpen] = useState(false);
  const { copyJanuary, isPending } = useSourceActions();

  const entryIds = source.cells.map((cell) => cell.entryId);
  const reported = useReportedCount(entryIds);
  const total = source.cells.length;
  const complete = reported === total;

  // The server refuses to copy an unreported January, so do not offer it.
  const januaryId = source.cells.find((cell) => cell.month === 1)?.entryId;
  const januaryReported = useReportedCount(januaryId ? [januaryId] : []) === 1;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="border-t py-3 first:border-t-0"
    >
      <div className="flex flex-wrap items-center gap-3">
        {/* Full width on a phone so the element name never truncates. */}
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 w-full min-w-0 justify-start aria-expanded:bg-transparent sm:w-auto sm:flex-1"
          >
            <ChevronDown
              className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
              aria-hidden
            />
            <span className="truncate font-medium">{source.element}</span>
          </Button>
        </CollapsibleTrigger>

        <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
          <span className="text-xs text-muted-foreground">{source.unit}</span>
          <Badge variant={complete ? "secondary" : "outline"} className="tabular-nums">
            {t("monthsProgress", { reported, total })}
          </Badge>
          {source.factorActive ? null : (
            <Badge variant="secondary">{t("factorInactive")}</Badge>
          )}
          <DeleteSourceButton
            emissionFactorId={source.emissionFactorId}
            element={source.element}
          />
        </div>
      </div>

      <CollapsibleContent>
        <div className="mt-3 space-y-3 rounded-lg border bg-muted/30 p-3">
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            {source.cells.map((cell) => (
              <ValueField
                key={cell.entryId}
                entryId={cell.entryId}
                unit={source.unit}
                label={tm(String(cell.month))}
                showLabel
                placeholder={t("notReported")}
              />
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending || !januaryReported}
            onClick={() => copyJanuary(source.emissionFactorId)}
          >
            <Copy className="size-4" aria-hidden />
            {t("copyJanuary")}
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
