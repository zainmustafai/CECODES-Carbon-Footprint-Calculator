"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { normalizeDecimalInput } from "@/lib/decimal-input";
import { cn } from "@/lib/utils";
import { useTransportTrips, type TripDraft } from "../hooks/use-transport-trips";
import { isValidTripNumber } from "../schemas/trip-schemas";
import type { EntryCell } from "../lib/types";

// One row per route for a COUNT_TIMES_DISTANCE source (C4, C6, C7 and C9). Client feedback
// 2026-09-03 (E3): the four templates CECODES sent are exactly this shape, and the two-box field
// this replaces forced the user to pre-multiply passengers by kilometres by hand and then
// explain how they arrived at the combined figure.
//
// The engine multiplies each route and adds the products (rollup.ts, COUNT_TIMES_DISTANCE), and
// the save action writes that same sum back onto the entry's `value`, so the total below is what
// the dashboard and the report will show.

// A blank row is a draft the user has not finished, so it gets no error styling; a row with
// something unparseable in it does, because that value will never be saved.
function isMalformed(raw: string): boolean {
  return raw.trim() !== "" && !isValidTripNumber(raw);
}

/** Display only. Floats are acceptable HERE for the same reason preview.ts allows them: nothing
 *  on this line is persisted, and the action recomputes the stored total with Prisma.Decimal. */
function displayTotal(rows: TripDraft[]): number {
  let total = 0;
  for (const row of rows) {
    if (!isValidTripNumber(row.count) || !isValidTripNumber(row.distanceKm)) continue;
    const count = Number(normalizeDecimalInput(row.count));
    const distance = Number(normalizeDecimalInput(row.distanceKm));
    total += count * distance;
  }
  return total;
}

export function TransportTripsField({
  cell,
  unit,
  element,
  describedBy,
}: {
  cell: EntryCell;
  /** The factor's own unit, e.g. "pasajeros * km", "ton * km" or "vehiculo * km". */
  unit: string;
  element: string;
  /** id of the scope panel's shared "non-negative, decimals allowed" hint. */
  describedBy?: string;
}) {
  const t = useTranslations("dataEntry.trips");
  const tv = useTranslations("dataEntry.validation");
  const format = useFormatter();
  const { rows, isPending, readOnly, update, add, remove, flush } = useTransportTrips({
    entryId: cell.entryId,
    initial: cell.trips,
  });

  // "pasajeros * km" -> "pasajeros"; "ton * km" -> "ton". Falls back to the whole unit string if
  // the library ever ships a shape this does not expect, rather than labelling the column with
  // nothing. Same split dual-value-field.tsx used before the table replaced it.
  const [countUnit] = unit.split(" * ");

  const complete = rows.filter(
    (row) => isValidTripNumber(row.count) && isValidTripNumber(row.distanceKm),
  );

  return (
    <div
      className="grid gap-2 rounded-lg border bg-muted/30 p-3"
      aria-busy={isPending || undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-medium text-muted-foreground">{t("title")}</h4>
        <Button size="sm" variant="outline" onClick={add} disabled={readOnly}>
          <Plus className="size-4" aria-hidden />
          {t("add")}
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">{t("reference")}</TableHead>
              <TableHead className="text-xs">{`${t("count")} (${countUnit || unit})`}</TableHead>
              <TableHead className="text-xs">{t("distance")}</TableHead>
              <TableHead className="text-xs">{t("note")}</TableHead>
              <TableHead className="w-10" aria-label={t("remove")} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => {
              const countBad = isMalformed(row.count);
              const distanceBad = isMalformed(row.distanceKm);
              // The route's own name if it has one, its position otherwise: with N rows on
              // screen every field has to say WHICH route it belongs to out loud, and a screen
              // reader landing on the fourth "Distancia" of the table needs more than the column.
              const routeName = row.reference.trim() || `#${index + 1}`;

              return (
                <TableRow key={row.key}>
                  <TableCell className="p-1">
                    <Input
                      className="h-9"
                      autoComplete="off"
                      disabled={readOnly}
                      aria-label={`${t("reference")}: ${element}, ${routeName}`}
                      value={row.reference}
                      onChange={(event) => update(row.key, "reference", event.target.value)}
                      onBlur={flush}
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      className="h-9 text-right tabular-nums"
                      inputMode="decimal"
                      autoComplete="off"
                      disabled={readOnly}
                      aria-invalid={countBad || undefined}
                      aria-describedby={describedBy}
                      aria-label={`${t("count")}: ${element}, ${routeName} (${countUnit || unit})`}
                      value={row.count}
                      onChange={(event) => update(row.key, "count", event.target.value)}
                      onBlur={flush}
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      className="h-9 text-right tabular-nums"
                      inputMode="decimal"
                      autoComplete="off"
                      disabled={readOnly}
                      aria-invalid={distanceBad || undefined}
                      aria-describedby={describedBy}
                      aria-label={`${t("distance")}: ${element}, ${routeName}`}
                      value={row.distanceKm}
                      onChange={(event) => update(row.key, "distanceKm", event.target.value)}
                      onBlur={flush}
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      className="h-9"
                      autoComplete="off"
                      disabled={readOnly}
                      aria-label={`${t("note")}: ${element}, ${routeName}`}
                      value={row.note}
                      onChange={(event) => update(row.key, "note", event.target.value)}
                      onBlur={flush}
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={readOnly}
                      aria-label={`${t("remove")}: ${routeName}`}
                      onClick={() => remove(row.key)}
                    >
                      <Trash2 className="size-4 text-destructive" aria-hidden />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/*
        A visible reason, not just a red ring. A route whose numbers do not parse is deliberately
        left out of the saved set, so without this line the toast would say "Viajes guardados"
        while that row silently never left the browser. Same contract as ValueField.
      */}
      {rows.some((row) => isMalformed(row.count) || isMalformed(row.distanceKm)) ? (
        <p className="text-xs text-destructive">{tv("valueFormat")}</p>
      ) : null}

      <p
        className={cn(
          "text-xs tabular-nums",
          complete.length > 0 ? "font-medium" : "text-muted-foreground",
        )}
      >
        {t("total", {
          count: complete.length,
          total: format.number(displayTotal(rows), { maximumFractionDigits: 2 }),
          unit,
        })}
      </p>
    </div>
  );
}
