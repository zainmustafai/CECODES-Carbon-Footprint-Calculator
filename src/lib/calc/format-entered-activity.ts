import type { EntryMode } from "@/lib/generated/prisma/client";

// What the company actually typed into a field, correctly labeled - as distinct from the
// activity quantity the calc engine derives from it (rollup.ts/preview.ts do that division or
// multiplication; this file never touches a total, only how the raw input is described).
//
// Two entry modes store a number whose meaning is NOT "quantity in the factor's own unit":
//   - MONEY_PER_GALLON stores a COP amount, not gallons - the factor's own unit ("gal") describes
//     what the engine derives, not what was entered.
//   - COUNT_TIMES_DISTANCE stores TWO numbers (count/passengers/vehicles, and distance in km) in
//     separate columns - showing only the first and the combined unit ("pasajeros * km") silently
//     drops the distance from anything that renders `value`+`unit` verbatim.
//
// Preview, the PDF, and the Excel export all rendered the raw stored value next to the factor's
// unit unconditionally (client feedback follow-up, 2026-08-15 audit) - this is the one place that
// fixes it, so the three render layers never need to know EntryMode exists.
export type EnteredActivity = {
  /** The primary reported number, correctly labeled. Null when nothing was entered. */
  value: number | null;
  /** The unit for `value` - the factor's own unit, except where entryMode overrides it. */
  unit: string;
  /** COUNT_TIMES_DISTANCE only: the second reported number (distance). Always null otherwise. */
  secondaryValue: number | null;
  /** Unit for `secondaryValue`, or null when there is no second number to label. */
  secondaryUnit: string | null;
};

/** MONEY_PER_GALLON's entered unit is always COP, regardless of locale - it is a currency code,
 *  not a translated word, so this one unit is safe to hardcode across every render target. */
const MONEY_UNIT = "COP";

/** "pasajeros * km" -> "pasajeros"; "vehículo * km" -> "vehículo". Falls back to the raw unit
 *  string if a factor of this entry mode is ever given a unit that isn't "X * Y" (defensive; the
 *  library's COUNT_TIMES_DISTANCE factors have always followed this shape). */
function primaryUnitOf(unit: string): string {
  return unit.split(" * ")[0]?.trim() || unit;
}

/** The distance half of "X * km". Falls back to "km" - every COUNT_TIMES_DISTANCE factor in the
 *  library is a per-distance rate, so this is a safe default even for a malformed unit string. */
function secondaryUnitOf(unit: string): string {
  return unit.split(" * ")[1]?.trim() || "km";
}

export function formatEnteredActivity(params: {
  entryMode: EntryMode;
  /** The primary stored value, already parsed to a display number (or null = not reported). */
  value: number | null;
  /** The stored secondaryValue, already parsed to a display number (or null). */
  secondaryValue: number | null;
  /** The factor's own unit, e.g. "gal", "kg", "pasajeros * km". */
  unit: string;
}): EnteredActivity {
  switch (params.entryMode) {
    case "MONEY_PER_GALLON":
      return { value: params.value, unit: MONEY_UNIT, secondaryValue: null, secondaryUnit: null };
    case "COUNT_TIMES_DISTANCE":
      return {
        value: params.value,
        unit: primaryUnitOf(params.unit),
        secondaryValue: params.secondaryValue,
        secondaryUnit: secondaryUnitOf(params.unit),
      };
    case "QUANTITY":
    default:
      return { value: params.value, unit: params.unit, secondaryValue: null, secondaryUnit: null };
  }
}
