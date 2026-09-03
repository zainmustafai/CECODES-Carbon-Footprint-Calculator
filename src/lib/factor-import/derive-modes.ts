import type { EntryMode } from "@/lib/generated/prisma/client";

// Which entry mode a workbook row asks for, decided by the row's own columns.
//
// The importer CREATES factors. Without this derivation every created row lands on the
// `entryMode` column default, QUANTITY, so a renamed "pasajeros * km" factor comes back asking
// for one pre-multiplied number instead of a count and a distance, and nothing says so.
//
// Migration 20260815120000 set entryMode once, by hand, and warned that string matching is
// fragile as an ONGOING mechanism. That warning is about ELEMENT names, which drift with every
// workbook revision. These two rules read the unit and the subcategory, which are part of the
// factor's natural key: if either changes, the factor is a different factor anyway.
//
// Verified against the official Emission Factors sheet (2026-09-03): the only units containing
// "km" are "pasajeros * km" (6 rows), "ton * km" (8) and "vehículo * km" (11), plus
// "km tubería" (4). That last one is a plain length, not a count times a distance, which is why
// this is an exact set and not a /km/ test.
//
// The unit arrives through normalizeUnit, which collapses the whitespace runs Excel emits, so
// comparing against a single-spaced literal is safe.
const DISTANCE_UNITS = new Set(["pasajeros * km", "ton * km", "vehículo * km"]);

// Both transport-subsidy factors carry unit "gal", exactly like an ordinary mobile-combustion
// row, so the unit cannot tell them apart. The subcategory can.
const SUBSIDY_SUBCATEGORY = "Subsidios de transporte";

export function deriveEntryMode(row: { unit: string; subcategory: string | null }): EntryMode {
  if (DISTANCE_UNITS.has(row.unit)) return "COUNT_TIMES_DISTANCE";
  if (row.subcategory === SUBSIDY_SUBCATEGORY) return "MONEY_PER_GALLON";
  return "QUANTITY";
}
