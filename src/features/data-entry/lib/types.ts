import type { GwpSet, Scope } from "@/lib/generated/prisma/client";
import type { PreviewFactor } from "@/lib/calc/preview";

// One editable value. `value` is a display string; "" means "not reported yet" (null in
// the database). Decimals never become JS numbers anywhere in this feature.
export type EntryCell = {
  entryId: string;
  month: number | null;
  value: string;
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
