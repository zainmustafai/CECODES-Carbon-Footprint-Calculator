import type { GwpSet, Scope } from "@/lib/generated/prisma/client";
import type { ElementTotal, MonthlyPoint } from "@/lib/calc/rollup";

export type { ElementTotal, MonthlyPoint };

// The view model the dashboard renders. Every number is tonnes CO2e, already computed by the
// engine roll-up. The screen is a server component: it builds this once and hands it to the
// presentational client charts, which never touch the database or the engine.

export type ScopeSlice = { scope: Scope; tonnes: number; pct: number };

export type CategorySlice = { scope: Scope; category: string; tonnes: number; pct: number };

export type GasBucket = "CO2" | "CH4" | "N2O" | "OTHER";

export type GasSlice = { gas: GasBucket; tonnes: number; pct: number };

// Emissions split by gas instead of by scope/category, for the sources whose factor actually
// retains a per-gas split. OTHER is a real, honestly-disclosed bucket, not an error: refrigerants,
// SF6/PFC/NF3, and spend/distance-based Scope 3 factors arrive already expressed as CO2e, with no
// underlying gas mass retained to split. See rollup.ts's CategoryTotal comment - the four slices
// always sum to the SAME total this screen's other cards already show, for whatever scope/category
// filter is currently active.
export type GasBreakdown = {
  /** Always CO2, CH4, N2O, OTHER in that fixed order (matches the GWP sheet's own row order). */
  slices: GasSlice[];
  otherPct: number;
  otherEntries: number;
  gasResolvedEntries: number;
};

// The company's single reduction goal (set on the Empresa screen) vs. its actual progress.
// Always company-wide - every facility, every Alcance combined - regardless of any facility
// filter active elsewhere on this dashboard, because the goal itself is company-wide by
// definition (set once, not per Sede). Null means: no target is configured, or the company has
// no reporting years yet (nothing to set a baseline from).
export type CompanyTargetProgress = {
  reductionPct: number;
  baselineYear: number;
  baselineTonnes: number;
  currentYear: number;
  currentTonnes: number;
  /**
   * (baseline - current) / baseline * 100: how much has actually been reduced so far. Negative
   * means an increase, not a reduction. Exactly 0 when currentYear IS the baseline year (nothing
   * to compare against yet) - a true statement, not a special case to guard against.
   */
  actualReductionPct: number;
};

// One sede's total for the selected year, for the "Emisiones por sede" chart the client's
// Power BI reference shows. Only meaningful on the all-facilities view.
export type SedeTotal = {
  facilityId: string;
  name: string;
  tonnes: number;
  /** Same honesty flag as YearTotal: an unpriceable source makes the bar an undercount. */
  incomplete: boolean;
};

export type YearTotal = {
  year: number;
  tonnes: number;
  /**
   * The year's total is INCOMPLETE: some sources could not be priced (no grid factor, no factor
   * row, an unreadable factor). Carried per year, not just for the selected one, because a
   * prior year with a missing grid factor otherwise renders as a shorter bar and a triumphant
   * "reduction" in the year-over-year KPI, which is a lie told with a real number.
   */
  incomplete: boolean;
};

export type DashboardFilters = {
  facilityId: string | null; // null means "all facilities" (company aggregate)
  year: number | null;
  scope: Scope | null; // null means "all scopes"
  category: string | null; // null means "all categories"
};

// The numbers for the selected year, after the scope/category refinement is applied to the
// headline figure and the category chart. The scope donut and the monthly trend always show
// the unfiltered year, because they are themselves the breakdown.
export type DashboardCurrent = {
  year: number;
  gwpSet: GwpSet;
  facilityCount: number;
  lastUpdated: string | null; // ISO, max entry updatedAt

  /** Headline total, reflecting the active scope/category refinement. */
  total: number;
  /** The gross year total, ignoring any refinement. Year over year compares this. */
  yearTotal: number;
  /** The label under the headline: "Emisiones brutas", "Alcance 1", a category name, ... */
  totalScopeLabel: Scope | null;
  totalCategoryLabel: string | null;

  byScope: ScopeSlice[]; // always the full three-scope split
  byCategory: CategorySlice[]; // reflects the scope refinement, largest first
  /**
   * Reflects the SAME scope/category refinement as `total`/`byCategory` above - unlike the scope
   * donut and monthly trend, gas is orthogonal to both scope and category (a refrigerant leak
   * contributes to OTHER whether you're looking at all of Alcance 1 or one of its categories), so
   * a filtered view is more informative here, not degenerate.
   */
  byGas: GasBreakdown;
  /**
   * Per-element totals, reflecting the SAME scope/category refinement as `byCategory`/`byGas`
   * above, largest first (the rollup already sorts it that way). Feeds the Pareto chart: one bar
   * per element, plus a client-computed cumulative-percentage line (see lib/pareto.ts).
   */
  byElement: ElementTotal[];
  monthly: MonthlyPoint[]; // Scope 2 only, twelve points
  biogenicTonnes: number;
  /**
   * Carbon removals total (category "Remociones"), negative or 0. Reported separately, never
   * inside `total`/`yearTotal`/`byScope`, matching the Excel's separate removals table.
   */
  removalsTonnes: number;
  missingGridFactor: boolean;
  /**
   * Sources excluded from every total because they could not be priced. Greater than zero means
   * the totals on this screen are INCOMPLETE, and the screen must say so: a number that is quietly
   * too low is worse than no number.
   */
  unpricedCount: number;
};

export type DashboardVM = {
  company: { name: string; sector: string | null };
  facilities: { id: string; name: string }[];
  years: number[]; // distinct calendar years with data, descending

  filters: DashboardFilters;

  /** Null when the selected year has no data, or no year is selected. */
  current: DashboardCurrent | null;
  /** The immediately preceding reporting year of the same facility scope, for year over year. */
  previous: YearTotal | null;
  /** Every year's total for the facility scope, ascending, for the comparison chart. */
  yearComparison: YearTotal[];
  /**
   * Per-sede totals for the selected year, largest first. Populated only on the all-facilities
   * view with at least two sedes reporting; a single-facility view has nothing to compare.
   */
  bySede: SedeTotal[];
  /** The company's reduction-goal progress. Null when not configured (see CompanyTargetProgress). */
  companyTarget: CompanyTargetProgress | null;

  /** No reporting years exist for this company at all: the honest empty state. */
  isEmpty: boolean;
};
