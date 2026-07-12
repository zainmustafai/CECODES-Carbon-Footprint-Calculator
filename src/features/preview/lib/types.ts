import type { GwpSet, Scope } from "@/lib/generated/prisma/client";
import type { SourceEstimate } from "@/lib/calc/preview";

// One row in the preview spreadsheet: an element the company reported against, with its
// entered quantity and the display-only estimated emissions from the shared preview engine.
export type PreviewSourceRow = {
  key: string;
  element: string;
  unit: string;
  subcategory: string | null;
  factorActive: boolean;
  /** Scope 2 only: 12 monthly activity strings (index 0 = January), "" when not reported. */
  monthly: string[];
  /** Sum of reported activity across all cells, as a display number (referential). */
  quantity: number;
  hasQuantity: boolean;
  estimate: SourceEstimate;
};

export type PreviewCategoryGroup = {
  category: string;
  sources: PreviewSourceRow[];
  /** Sum of the sources' estimated tonnes (only the ones that could be computed). */
  tonnes: number;
};

export type PreviewScopeGroup = {
  scope: Scope;
  categories: PreviewCategoryGroup[];
  tonnes: number;
};

export type PreviewFacility = { id: string; name: string };

export type PreviewEmptyReason = "noFacility" | "noYear" | "noData";

export type PreviewVM = {
  facilities: PreviewFacility[];
  years: number[];
  filters: { facilityId: string | null; year: number | null };
  selectedFacilityName: string | null;
  gwpSet: GwpSet | null;
  scopes: PreviewScopeGroup[];
  totalTonnes: number;
  biogenicTonnes: number;
  /** The selected year has Scope 2 activity but no national grid factor was loaded for it. */
  missingGridFactor: boolean;
  isEmpty: boolean;
  emptyReason: PreviewEmptyReason | null;
};
