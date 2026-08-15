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

// One free-form "tecnologías más limpias y buenas prácticas" row, verbatim as reported.
// Display-only: these never touch any total (CECODES, 2026-07-24).
export type PreviewCleanTechRow = {
  id: string;
  scope: Scope | null;
  element: string;
  quantity: string | null;
  unit: string | null;
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
  /**
   * Carbon removals (category "Remociones"), shown as their own table with their own (negative)
   * total and NEVER included in totalTonnes or any scope total, exactly as the client's Excel
   * keeps its removals table separate. Null when the year has no removal sources.
   */
  removals: PreviewCategoryGroup | null;
  /** Free-form clean-technology rows for this sede-year; shown as their own table, no totals. */
  cleanTech: PreviewCleanTechRow[];
  /** The selected year has Scope 2 activity but no national grid factor was loaded for it. */
  missingGridFactor: boolean;
  /** The selected year has a MONEY_PER_GALLON source but no transport-subsidy price loaded. */
  missingTransportSubsidyPrice: boolean;
  isEmpty: boolean;
  emptyReason: PreviewEmptyReason | null;
};
