"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { GwpSet } from "@/lib/generated/prisma/client";
import type { PreviewGridFactor, PreviewSubsidyPrice } from "@/lib/calc/preview";
import type { SourceVM } from "../lib/types";
import { ValueField } from "./value-field";
import { TransportTripsField } from "./transport-trips-field";
import { DeleteSourceButton } from "./delete-source-button";
import { EstimatePopover } from "./estimate-popover";

// Alcance 1 and Alcance 3: a single annual value per source, on a single line.
//
// DESIGN.md: "an annual Scope 1 or 3 source gets a single compact line, because one value does
// not deserve a card". The estimate used to trail the row as a third line of labelled facts
// (Emisiones estimadas, Factor aplicado, Conjunto GWP), which buried the input. The number now
// sits on the row as the trigger, and the rest of the facts live inside it.
//
// A COUNT_TIMES_DISTANCE source is the one exception: it carries N routes, so it gets its own
// block under the line rather than a field on it (client feedback 2026-09-03, E3).
export function SourceRow({
  source,
  gridFactor,
  pricePerGallon,
  gwpSet,
  year,
  hintId,
  onDeleted,
}: {
  source: SourceVM;
  gridFactor: PreviewGridFactor | null;
  pricePerGallon: PreviewSubsidyPrice | null;
  gwpSet: GwpSet;
  year: number;
  /** The scope panel's shared "non-negative, decimals allowed" hint. */
  hintId?: string;
  onDeleted?: () => void;
}) {
  const t = useTranslations("dataEntry.source");
  const cell = source.cells[0];
  if (!cell) return null;
  // The trip table is per SOURCE, not per cell, and these modes only ever exist on Scope 3's
  // annual single-cell sources, so it reads the one annual cell exactly as the value field does.
  const trips = source.entryMode === "COUNT_TIMES_DISTANCE";

  const identity = (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="truncate text-sm font-medium">{source.element}</span>
        {source.biogenic ? <Badge variant="outline">{t("biogenic")}</Badge> : null}
        {source.factorActive ? null : <Badge variant="secondary">{t("factorInactive")}</Badge>}
      </div>
      {source.subcategory ? (
        <p className="truncate text-xs text-muted-foreground">{source.subcategory}</p>
      ) : null}
    </div>
  );

  const actions = (
    <div className="flex shrink-0 items-center justify-end gap-0.5">
      <EstimatePopover
        source={source}
        gridFactor={gridFactor}
        pricePerGallon={pricePerGallon}
        gwpSet={gwpSet}
        year={year}
      />
      <DeleteSourceButton
        emissionFactorId={source.emissionFactorId}
        element={source.element}
        onDeleted={onDeleted}
      />
    </div>
  );

  if (trips) {
    return (
      <div className="flex flex-col gap-3 border-t py-3 first:border-t-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">{identity}</div>
          {actions}
        </div>
        {/* Keyed by the entry. The field seeds its rows from props ONCE and deliberately does
            not re-sync them, so that a server refresh cannot discard what the user is typing.
            Without a key React would reconcile by position and hand one source's rows to a
            different source after a year or filter change; the key makes it remount instead. */}
        <TransportTripsField
          key={cell.entryId}
          cell={cell}
          unit={source.unit}
          element={source.element}
          describedBy={hintId}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t py-2 first:border-t-0 md:grid md:grid-cols-[minmax(0,1fr)_12rem_auto] md:items-center md:gap-3">
      {identity}

      {/* On a phone the value, the estimate and the delete button share one row. From md the
          wrapper dissolves (display: contents) and each becomes a grid cell of its own. */}
      <div className="flex items-center gap-1 md:contents">
        <ValueField
          className="flex-1"
          entryId={cell.entryId}
          // MONEY_PER_GALLON is reported in COP, not the factor's own gal unit - the
          // popover shows the derived gallons as an auditable intermediate step.
          unit={source.entryMode === "MONEY_PER_GALLON" ? t("cop") : source.unit}
          label={`${t("annualValue")}: ${source.element}`}
          placeholder={t("notReported")}
          describedBy={hintId}
        />
        {actions}
      </div>
    </div>
  );
}
