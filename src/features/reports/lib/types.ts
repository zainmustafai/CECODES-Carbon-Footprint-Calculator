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
  /** The correct unit for `value` - see src/lib/calc/format-entered-activity.ts. Never the raw
   *  factor unit for an entry mode that reinterprets the stored number (MONEY_PER_GALLON,
   *  COUNT_TIMES_DISTANCE). */
  unit: string;
  /** 1-12 for Scope 2, null for the annual scopes. */
  month: number | null;
  /** As entered. A Decimal string, or null when the cell was never filled. */
  value: string | null;
  /** COUNT_TIMES_DISTANCE only: the distance half of what was entered. Null otherwise. */
  secondaryValue: string | null;
  /** Unit for secondaryValue (e.g. "km"), or null when there is no second number. */
  secondaryUnit: string | null;
};

export type ResultRow = {
  scope: Scope;
  category: string;
  subcategory: string | null;
  element: string;
  /** The correct unit for `quantity` - see src/lib/calc/format-entered-activity.ts. */
  unit: string;
  /** Total activity for this element across the year, in `unit`. */
  quantity: number;
  /** COUNT_TIMES_DISTANCE only: the summed distance half. Null otherwise. */
  secondaryQuantity: number | null;
  /** Unit for secondaryQuantity (e.g. "km"), or null when there is no second number. */
  secondaryUnit: string | null;
  /** The factor that priced it, for auditability. */
  factorValue: string | null;
  factorUnit: string | null;
  tonnes: number;
  /**
   * The factor's uncertainty, as a +/- percentage string, or null when the library has none for
   * this element. Coverage is partial (roughly Scope 1 only), so the PDF shows null as "no
   * disponible". This is a per-element figure only: CECODES has not defined a method for combining
   * uncertainties into a scope or total, and the report never invents one.
   */
  uncertaintyPct: string | null;
};

export type ScopeTotal = { scope: Scope; tonnes: number };

export type CategoryRow = {
  scope: Scope;
  category: string;
  tonnes: number;
  /**
   * The category's gas breakdown (see rollup.ts's CategoryTotal, whose extra fields ride along
   * unnoticed by the type checker whenever `rollup.byCategory` itself is assigned to `byCategory`
   * below - the same "wider object satisfies the narrower field list" trick load-report.ts's own
   * EntryRow comment documents). Declared here, and made required to READ, so the ISO 14064-1
   * table (build-pdf.tsx, build-workbook.ts) can build a by-gas view without a second
   * calculation. Optional because a handwritten fixture that predates the gas breakdown
   * (2026-08-15) can still omit them; the ISO table then treats the category as contributing 0 to
   * every gas bucket, exactly like RollupFactor.gasType defaults to null elsewhere.
   */
  co2Tonnes?: number;
  ch4Tonnes?: number;
  n2oTonnes?: number;
  /** Keyed by RollupFactor.gasType ("HFC", "SF6", "NF3", ...) or OTHER_GAS_FALLBACK. */
  otherGasesByType?: Record<string, number>;
};

/** One facility's total for the selected year, in a company-wide report. */
export type SedeTotal = {
  facilityId: string;
  facilityName: string;
  tonnes: number;
  /** Same honesty flag as the dashboard's SedeTotal: an unpriceable source undercounts it. */
  incomplete: boolean;
};

export type ReportVM = {
  companyName: string;
  /** Null means "todas las sedes": a company-wide report, not one facility's. */
  facilityName: string | null;
  year: number;
  gwpSet: GwpSet;
  gridFactor: string | null;

  /**
   * Per-facility subtotals for the selected year, largest first. Always empty in
   * single-facility mode; populated only when facilityName is null.
   */
  bySede: SedeTotal[];

  activity: ActivityRow[];
  results: ResultRow[];
  byScope: ScopeTotal[];
  byCategory: CategoryRow[];
  totalTonnes: number;

  /**
   * Carbon removals (category "Remociones"): their own rows and their own (negative) total,
   * never included in totalTonnes/byScope/byCategory, exactly as the client's Excel keeps its
   * BASE_remociones table separate. Empty rows + 0 when the year reports none.
   */
  removals: { rows: ResultRow[]; tonnes: number };

  /**
   * Free-form "tecnologías más limpias y buenas prácticas" rows, verbatim as reported. They
   * never feed a calculation and carry no totals (CECODES, 2026-07-24).
   */
  cleanTech: {
    scope: Scope | null;
    element: string;
    quantity: string | null;
    unit: string | null;
  }[];

  // The disclosures. A report is the first artifact that leaves the building, so it must carry
  // its own caveats: a total that is quietly incomplete is worse than no total.
  biogenicTonnes: number;
  biogenicCo2Tonnes: number;
  biogenicCo2Partial: boolean;
  missingGridFactor: boolean;
  missingTransportSubsidyPrice: boolean;
  unpricedCount: number;

  /** When the numbers were produced. They are computed live, not snapshotted. */
  generatedAt: Date;
};
