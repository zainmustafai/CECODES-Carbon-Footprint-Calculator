import type { EntryMode, GwpSet, Scope } from "@/lib/generated/prisma/client";
import type { PreviewFactor } from "@/lib/calc/preview";

// One route of a COUNT_TIMES_DISTANCE source: a count and a distance, multiplied (client
// feedback 2026-09-03, E3). Every field is a display string, "" where the column is null, so
// nothing here is ever a JS number.
export type TripVM = {
  reference: string;
  count: string;
  distanceKm: string;
  note: string;
};

// One editable value. `value` is a display string; "" means "not reported yet" (null in
// the database). Decimals never become JS numbers anywhere in this feature.
export type EntryCell = {
  entryId: string;
  month: number | null;
  value: string;
  /** Only meaningful when the source's entryMode is COUNT_TIMES_DISTANCE: distance in km,
   *  paired with `value` holding the passenger/vehicle count (client feedback 2026-08-15).
   *  Since trip rows arrived this pair is derived, not typed: the save action writes the sum of
   *  the products into `value` and 1 into `secondaryValue`. */
  secondaryValue: string;
  /** The routes behind a COUNT_TIMES_DISTANCE source, in display order. Empty for every other
   *  source, and empty for a transport source entered before trip rows existed. */
  trips: TripVM[];
};

export type SourceVM = {
  emissionFactorId: string;
  scope: Scope;
  category: string;
  subcategory: string | null;
  element: string;
  unit: string;
  biogenic: boolean;
  factorActive: boolean;
  /** Feeds the estimated-emissions summary. Null when the factor row is gone (SetNull). */
  factor: PreviewFactor | null;
  /** How this source's activity quantity is derived. Defaults to QUANTITY for every source
   *  before 2026-08-15; MONEY_PER_GALLON and COUNT_TIMES_DISTANCE change how the row renders. */
  entryMode: EntryMode;
  cells: EntryCell[];
};

export type CategoryVM = {
  scope: Scope;
  category: string;
  applies: boolean;
  sources: SourceVM[];
};

export type ScopeVM = {
  scope: Scope;
  categories: CategoryVM[];
};

// The factor library, grouped for the "Agregar fuente" picker.
export type FactorOption = {
  id: string;
  element: string;
  unit: string;
  subcategory: string | null;
  biogenic: boolean;
};

export type FactorSubgroup = {
  subcategory: string | null;
  options: FactorOption[];
};

export type FactorCategory = {
  category: string;
  subgroups: FactorSubgroup[];
};

export type GroupedFactors = Record<Scope, FactorCategory[]>;

export type FacilityVM = { id: string; name: string; location: string };
// gwpSet is the enum, not a loose string: the emissions preview indexes the GWP table with it.
export type YearVM = { id: string; year: number; gwpSet: GwpSet };
