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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { GwpSet } from "@/lib/generated/prisma/client";
import type { PreviewGridFactor } from "@/lib/calc/preview";
import type { SourceVM } from "../lib/types";
import { domId } from "../lib/dom-id";
import { useReportedCount } from "../hooks/use-reported-count";
import { useSourceActions } from "../hooks/use-source-actions";
import { ValueField } from "./value-field";
import { DeleteSourceButton } from "./delete-source-button";
import { SourceSummary } from "./source-summary";

// Alcance 2: twelve monthly values, Enero to Diciembre.
// The grid is 1 column on a phone, 3 at md, 4 at lg and up; the estimated-emissions rail sits
// beside it only from xl, because at lg with the sidebar open 4 columns plus an 18rem rail
// squeezed each input to about 74px.
//
// Arrow keys are deliberately NOT bound to move between month fields: they must move the
// text caret inside the input. Tab order runs Enero to Diciembre, then Copiar Enero.
export function MonthlySourceRow({
  source,
  gridFactor,
  gwpSet,
  year,
  defaultOpen = false,
  onDeleted,
}: {
  source: SourceVM;
  gridFactor: PreviewGridFactor | null;
  gwpSet: GwpSet;
  year: number;
  defaultOpen?: boolean;
  onDeleted?: () => void;
}) {
  const t = useTranslations("dataEntry.source");
  const tm = useTranslations("dataEntry.months");
  const tv = useTranslations("dataEntry");
  const [open, setOpen] = useState(defaultOpen);
  const { copyJanuary, isPending } = useSourceActions();

  const entryIds = source.cells.map((cell) => cell.entryId);
  const reported = useReportedCount(entryIds);
  const total = source.cells.length;
  const complete = reported === total;

  // The copy action fills only the EMPTY months, so it is offered exactly when it can do
  // something: January holds a value and at least one other month does not.
  const januaryId = source.cells.find((cell) => cell.month === 1)?.entryId;
  const januaryReported = useReportedCount(januaryId ? [januaryId] : []) === 1;
  const canCopy = januaryReported && !complete;
  const copyDisabledReason = !januaryReported
    ? tv("errors.januaryEmpty")
    : complete
      ? t("copyJanuaryNothingEmpty")
      : null;

  const hintId = domId("hint", source.emissionFactorId || source.element);

  const copyButton = (
    <Button
      variant="ghost"
      size="sm"
      loading={isPending}
      disabled={!canCopy}
      onClick={() => void copyJanuary(source.emissionFactorId)}
    >
      <Copy className="size-4" aria-hidden />
      {t("copyJanuary")}
    </Button>
  );

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="scroll-mt-24 border-t py-3 first:border-t-0"
    >
      <div className="flex flex-wrap items-center gap-3">
        {/* Full width on a phone so the element name never truncates. An h3 beneath the
            category's h2, so the outline stays navigable. */}
        <h3 className="-ml-2 w-full min-w-0 sm:w-auto sm:flex-1">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full min-w-0 justify-start aria-expanded:bg-transparent"
            >
              <ChevronDown
                className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
                aria-hidden
              />
              <span className="truncate font-medium">{source.element}</span>
            </Button>
          </CollapsibleTrigger>
        </h3>

        <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
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
            onDeleted={onDeleted}
          />
        </div>
      </div>

      <CollapsibleContent>
        <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_18rem]">
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
              {source.cells.map((cell) => (
                <ValueField
                  key={cell.entryId}
                  entryId={cell.entryId}
                  unit={source.unit}
                  label={tm(String(cell.month))}
                  showLabel
                  placeholder={t("notReported")}
                  describedBy={hintId}
                />
              ))}
            </div>

            <p id={hintId} className="text-xs text-muted-foreground">
              {tv("valueHint")}
            </p>

            {/* A disabled button explains itself, or it reads as broken. Tooltips do not fire
                on disabled elements, so the span carries the trigger. */}
            {copyDisabledReason ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-block">{copyButton}</span>
                </TooltipTrigger>
                <TooltipContent>{copyDisabledReason}</TooltipContent>
              </Tooltip>
            ) : (
              copyButton
            )}
          </div>

          <SourceSummary
            source={source}
            gridFactor={gridFactor}
            gwpSet={gwpSet}
            year={year}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
