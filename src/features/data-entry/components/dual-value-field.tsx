"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { EntryCell } from "../lib/types";
import { ValueField } from "./value-field";

// A COUNT_TIMES_DISTANCE source (client feedback 2026-08-15, Scope 3 "pasajeros*km" /
// "vehiculo*km" categories) asks for two numbers instead of one pre-multiplied total: how many
// passengers or vehicles, and how far. The engine multiplies them - see rollup.ts's
// COUNT_TIMES_DISTANCE branch - so the user never has to do that arithmetic by hand or explain
// how they arrived at a combined figure.
//
// Reuses ValueField unchanged for both halves. The distance half is bound to a synthetic
// "<entryId>:secondary" key (see data-entry-provider.tsx), which the autosave store treats as
// just another opaque key - only the flush step knows it maps to the secondaryValue column.
const SECONDARY_KEY_SUFFIX = ":secondary";

export function DualValueField({
  cell,
  unit,
  element,
  describedBy,
  className,
}: {
  cell: EntryCell;
  /** The factor's own unit, e.g. "pasajeros * km" or "vehiculo * km". */
  unit: string;
  element: string;
  describedBy?: string;
  className?: string;
}) {
  const t = useTranslations("dataEntry.source");
  // "pasajeros * km" -> "pasajeros"; "vehiculo * km" -> "vehiculo". Falls back to the whole
  // unit string if the library ever ships a shape this doesn't expect, rather than crashing.
  const [countUnit] = unit.split(" * ");

  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      <ValueField
        entryId={cell.entryId}
        unit={countUnit || unit}
        label={`${t("count")}: ${element}`}
        placeholder={t("notReported")}
        describedBy={describedBy}
      />
      <ValueField
        entryId={`${cell.entryId}${SECONDARY_KEY_SUFFIX}`}
        unit={t("km")}
        label={`${t("distance")}: ${element}`}
        placeholder={t("notReported")}
        describedBy={describedBy}
      />
    </div>
  );
}
