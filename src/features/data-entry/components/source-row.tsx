"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { GwpSet } from "@/lib/generated/prisma/client";
import type { PreviewGridFactor } from "@/lib/calc/preview";
import type { SourceVM } from "../lib/types";
import { ValueField } from "./value-field";
import { DeleteSourceButton } from "./delete-source-button";
import { EstimatePopover } from "./estimate-popover";

// Alcance 1 and Alcance 3: a single annual value per source, on a single line.
//
// DESIGN.md: "an annual Scope 1 or 3 source gets a single compact line, because one value does
// not deserve a card". The estimate used to trail the row as a third line of labelled facts
// (Emisiones estimadas, Factor aplicado, Conjunto GWP), which buried the input. The number now
// sits on the row as the trigger, and the rest of the facts live inside it.
export function SourceRow({
  source,
  gridFactor,
  gwpSet,
  year,
  hintId,
  onDeleted,
}: {
  source: SourceVM;
  gridFactor: PreviewGridFactor | null;
  gwpSet: GwpSet;
  year: number;
  /** The scope panel's shared "non-negative, decimals allowed" hint. */
  hintId?: string;
  onDeleted?: () => void;
}) {
  const t = useTranslations("dataEntry.source");
  const cell = source.cells[0];
  if (!cell) return null;

  return (
    <div className="flex flex-col gap-2 border-t py-2 first:border-t-0 md:grid md:grid-cols-[minmax(0,1fr)_12rem_auto] md:items-center md:gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{source.element}</span>
          {source.biogenic ? <Badge variant="outline">{t("biogenic")}</Badge> : null}
          {source.factorActive ? null : (
            <Badge variant="secondary">{t("factorInactive")}</Badge>
          )}
        </div>
        {source.subcategory ? (
          <p className="truncate text-xs text-muted-foreground">{source.subcategory}</p>
        ) : null}
      </div>

      {/* On a phone the value, the estimate and the delete button share one row. From md the
          wrapper dissolves (display: contents) and each becomes a grid cell of its own. */}
      <div className="flex items-center gap-1 md:contents">
        <ValueField
          className="flex-1"
          entryId={cell.entryId}
          unit={source.unit}
          label={`${t("annualValue")}: ${source.element}`}
          placeholder={t("notReported")}
          describedBy={hintId}
        />
        <div className="flex shrink-0 items-center justify-end gap-0.5">
          <EstimatePopover
            source={source}
            gridFactor={gridFactor}
            gwpSet={gwpSet}
            year={year}
          />
          <DeleteSourceButton
            emissionFactorId={source.emissionFactorId}
            element={source.element}
            onDeleted={onDeleted}
          />
        </div>
      </div>
    </div>
  );
}
