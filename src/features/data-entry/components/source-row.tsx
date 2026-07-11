"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { GwpSet } from "@/lib/generated/prisma/client";
import type { PreviewGridFactor } from "@/lib/calc/preview";
import type { SourceVM } from "../lib/types";
import { ValueField } from "./value-field";
import { DeleteSourceButton } from "./delete-source-button";
import { SourceSummary } from "./source-summary";

// Alcance 1 and Alcance 3: a single annual value per source.
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
  /** The category's shared "non-negative, decimals allowed" hint. */
  hintId?: string;
  onDeleted?: () => void;
}) {
  const t = useTranslations("dataEntry.source");
  const cell = source.cells[0];
  if (!cell) return null;

  return (
    <div className="space-y-2 border-t py-3 first:border-t-0">
      <div className="flex flex-col gap-3 md:grid md:grid-cols-[1fr_14rem_auto] md:items-center">
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

        {/* On a phone the value and the delete button share one row. From md the wrapper
            dissolves (display: contents) and both become grid cells of their own. */}
        <div className="flex items-center gap-2 md:contents">
          <ValueField
            className="flex-1"
            entryId={cell.entryId}
            unit={source.unit}
            label={`${t("annualValue")}: ${source.element}`}
            placeholder={t("notReported")}
            describedBy={hintId}
          />
          <DeleteSourceButton
            emissionFactorId={source.emissionFactorId}
            element={source.element}
            onDeleted={onDeleted}
          />
        </div>
      </div>

      <SourceSummary
        source={source}
        gridFactor={gridFactor}
        gwpSet={gwpSet}
        year={year}
        variant="compact"
      />
    </div>
  );
}
