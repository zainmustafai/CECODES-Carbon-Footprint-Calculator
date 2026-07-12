import type { GwpSet, Scope } from "@/lib/generated/prisma/client";

// The view model behind the Excel/CSV export (Requirements 10, 14.7).
//
// Two kinds of row, kept deliberately apart:
//   - ActivityRow  is what the company ENTERED. No arithmetic is applied to it at all.
//   - ResultRow    is what the engine COMPUTED, and every one of its numbers comes from
//                  rollupYear, the same function that feeds the dashboard.
//
// Keeping them separate is what lets CECODES check us: they can reconcile our inputs against
// their spreadsheet's inputs first, and only then argue about the maths.

export type ActivityRow = {
  scope: Scope;
  category: string;
  subcategory: string | null;
  element: string;
  unit: string;
  /** 1-12 for Scope 2, null for the annual scopes. */
  month: number | null;
  /** As entered. A Decimal string, or null when the cell was never filled. */
  value: string | null;
};

export type ResultRow = {
  scope: Scope;
  category: string;
  subcategory: string | null;
  element: string;
  unit: string;
  /** Total activity for this element across the year. */
  quantity: number;
  /** The factor that priced it, for auditability. */
  factorValue: string | null;
  factorUnit: string | null;
  tonnes: number;
};

export type ScopeTotal = { scope: Scope; tonnes: number };
export type CategoryRow = { scope: Scope; category: string; tonnes: number };

export type ReportVM = {
  companyName: string;
  facilityName: string;
  year: number;
  gwpSet: GwpSet;
  gridFactor: string | null;

  activity: ActivityRow[];
  results: ResultRow[];
  byScope: ScopeTotal[];
  byCategory: CategoryRow[];
  totalTonnes: number;

  // The disclosures. A report is the first artifact that leaves the building, so it must carry
  // its own caveats: a total that is quietly incomplete is worse than no total.
  biogenicTonnes: number;
  biogenicCo2Tonnes: number;
  biogenicCo2Partial: boolean;
  missingGridFactor: boolean;
  unpricedCount: number;

  /** When the numbers were produced. They are computed live, not snapshotted. */
  generatedAt: Date;
};
