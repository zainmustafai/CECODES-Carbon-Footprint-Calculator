import { prisma } from "@/lib/prisma";
import { resolveGwpSet } from "@/lib/gwp";
import { rollupYear, type YearRollup } from "@/lib/calc/rollup";
import { toRollupEntries } from "@/lib/calc/rollup-entries";
import type { GwpSet, Scope } from "@/lib/generated/prisma/client";
import type {
  CategorySlice,
  CompanyTargetProgress,
  DashboardCurrent,
  DashboardFilters,
  DashboardVM,
  GasBreakdown,
  ScopeSlice,
  SedeTotal,
  YearTotal,
} from "./types";

const SCOPES: Scope[] = ["SCOPE_1", "SCOPE_2", "SCOPE_3"];

// Builds the whole dashboard view model for one company and one set of filters.
//
// It computes on the fly rather than reading ResultSnapshot, which is not written yet. The
// data volume per company-year is small (tens of entries), so a per-request roll-up is cheap
// and always fresh. Everything crosses the engine as strings and comes back as tonnes.
export async function loadDashboard(
  companyId: string,
  requested: Partial<DashboardFilters>,
): Promise<DashboardVM> {
  const [company, facilities, reportingYears] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, sector: true },
    }),
    prisma.facility.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.reportingYear.findMany({
      where: { companyId },
      select: { id: true, facilityId: true, year: true, gwpSet: true },
    }),
  ]);

  const companyVM = { name: company?.name ?? "", sector: company?.sector ?? null };

  // The facility scope: one facility, or all of them (company aggregate) when none is named.
  const facilityId =
    requested.facilityId && facilities.some((f) => f.id === requested.facilityId)
      ? requested.facilityId
      : null;

  const scopedYears = facilityId
    ? reportingYears.filter((ry) => ry.facilityId === facilityId)
    : reportingYears;

  const years = [...new Set(scopedYears.map((ry) => ry.year))].sort((a, b) => b - a);

  const emptyVM: DashboardVM = {
    company: companyVM,
    facilities,
    years,
    filters: { facilityId, year: null, scope: null, category: null },
    current: null,
    previous: null,
    yearComparison: [],
    bySede: [],
    companyTarget: null,
    isEmpty: years.length === 0,
  };

  if (years.length === 0) return emptyVM;

  // The baseline the company's reduction goal is measured against - always the company's
  // OVERALL first reported year across every facility, never just this view's facility filter.
  const companyFirstYear = Math.min(...reportingYears.map((ry) => ry.year));

  // The selected calendar year, defaulting to the most recent one with data.
  const year =
    requested.year && years.includes(requested.year) ? requested.year : years[0];
  const scope = requested.scope && SCOPES.includes(requested.scope) ? requested.scope : null;

  // Reporting-year ids grouped by calendar year, within the facility scope.
  const idsByYear = new Map<number, string[]>();
  for (const ry of scopedYears) {
    const list = idsByYear.get(ry.year) ?? [];
    list.push(ry.id);
    idsByYear.set(ry.year, list);
  }
  const allReportingYearIds = scopedYears.map((ry) => ry.id);

  // One pass for every entry, plus the grid factors, transport-subsidy prices, and the
  // company's reduction target (if any).
  const [entries, gridFactors, subsidyPrices, companyTargetRow] = await Promise.all([
    prisma.activityEntry.findMany({
      where: { reportingYearId: { in: allReportingYearIds } },
      select: {
        reportingYearId: true,
        scope: true,
        category: true,
        // The finer levels of the Requirements 7.4 hierarchy. The entry snapshots them at write
        // time, so they survive a factor being renamed or deleted.
        subcategory: true,
        element: true,
        month: true,
        value: true,
        secondaryValue: true,
        updatedAt: true,
        emissionFactor: {
          select: {
            co2Factor: true,
            ch4Factor: true,
            n2oFactor: true,
            co2eFactor: true,
            biogenic: true,
            entryMode: true,
          },
        },
      },
    }),
    prisma.gridElectricityFactor.findMany({
      where: { year: { in: years } },
      select: { year: true, factor: true },
    }),
    prisma.transportSubsidyPrice.findMany({
      where: { year: { in: years } },
      select: { year: true, pricePerGallonCop: true },
    }),
    prisma.companyTarget.findUnique({
      where: { companyId },
      select: { reductionPct: true },
    }),
  ]);

  const gridByYear = new Map(gridFactors.map((g) => [g.year, g.factor.toString()]));
  const priceByYear = new Map(subsidyPrices.map((p) => [p.year, p.pricePerGallonCop.toString()]));
  const gwpByYear = new Map(scopedYears.map((ry) => [ry.year, ry.gwpSet]));

  const entriesByReportingYear = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = entriesByReportingYear.get(entry.reportingYearId) ?? [];
    list.push(entry);
    entriesByReportingYear.set(entry.reportingYearId, list);
  }

  // Roll an arbitrary set of reporting-year ids up under one calendar year's grid factor and
  // GWP set. Shared by the whole-year totals and the per-sede split, so they cannot disagree.
  function rollupForIds(ids: string[], targetYear: number): YearRollup {
    const rows = ids.flatMap((id) => entriesByReportingYear.get(id) ?? []);
    return rollupYear({
      entries: toRollupEntries(rows),
      gridFactor: gridByYear.get(targetYear) ?? null,
      pricePerGallon: priceByYear.get(targetYear) ?? null,
      gwpSet: (gwpByYear.get(targetYear) ?? resolveGwpSet(targetYear)) as GwpSet,
    });
  }

  // Roll every calendar year up (needed for the comparison chart and year over year).
  function rollupForYear(targetYear: number): YearRollup {
    return rollupForIds(idsByYear.get(targetYear) ?? [], targetYear);
  }

  // Keep each year's completeness, not just its total. Discarding it made a year with no grid
  // factor look like a genuine reduction rather than a hole in the data.
  const yearComparison: YearTotal[] = [...years]
    .sort((a, b) => a - b)
    .map((y) => {
      const r = rollupForYear(y);
      return {
        year: y,
        tonnes: r.totalTonnes,
        incomplete: r.missingGridFactor || r.unpricedCount > 0,
      };
    });

  const rollup = rollupForYear(year);
  const yearTotal = rollup.totalTonnes;

  const pctOf = (value: number) => (yearTotal > 0 ? (value / yearTotal) * 100 : 0);

  const byScope: ScopeSlice[] = SCOPES.map((s) => ({
    scope: s,
    tonnes: rollup.byScope[s],
    pct: pctOf(rollup.byScope[s]),
  }));

  // The category chart follows the scope refinement; the category filter narrows the headline.
  const scopedCategories = scope
    ? rollup.byCategory.filter((c) => c.scope === scope)
    : rollup.byCategory;
  const byCategory: CategorySlice[] = scopedCategories.map((c) => ({
    scope: c.scope,
    category: c.category,
    tonnes: c.tonnes,
    pct: pctOf(c.tonnes),
  }));

  const category =
    requested.category && scopedCategories.some((c) => c.category === requested.category)
      ? requested.category
      : null;

  // The headline total honours whatever refinement is active.
  let total = yearTotal;
  if (category) {
    total = scopedCategories
      .filter((c) => c.category === category)
      .reduce((sum, c) => sum + c.tonnes, 0);
  } else if (scope) {
    total = rollup.byScope[scope];
  }

  // Same filter as `total` above (scope AND category), so the gas breakdown always ties back to
  // the exact number the KPI card already shows - the reconciliation is undeniable in the code
  // itself, not just true in theory.
  const gasSource = category ? scopedCategories.filter((c) => c.category === category) : scopedCategories;
  const gasTotals = gasSource.reduce(
    (acc, c) => ({
      co2: acc.co2 + c.co2Tonnes,
      ch4: acc.ch4 + c.ch4Tonnes,
      n2o: acc.n2o + c.n2oTonnes,
      other: acc.other + c.otherGasesTonnes,
      gasResolvedEntries: acc.gasResolvedEntries + c.gasResolvedEntries,
      otherEntries: acc.otherEntries + c.otherGasesEntries,
    }),
    { co2: 0, ch4: 0, n2o: 0, other: 0, gasResolvedEntries: 0, otherEntries: 0 },
  );
  const gasPct = (value: number) => (total > 0 ? (value / total) * 100 : 0);
  const byGas: GasBreakdown = {
    slices: [
      { gas: "CO2", tonnes: gasTotals.co2, pct: gasPct(gasTotals.co2) },
      { gas: "CH4", tonnes: gasTotals.ch4, pct: gasPct(gasTotals.ch4) },
      { gas: "N2O", tonnes: gasTotals.n2o, pct: gasPct(gasTotals.n2o) },
      { gas: "OTHER", tonnes: gasTotals.other, pct: gasPct(gasTotals.other) },
    ],
    otherPct: gasPct(gasTotals.other),
    otherEntries: gasTotals.otherEntries,
    gasResolvedEntries: gasTotals.gasResolvedEntries,
  };

  const lastUpdated = entries.reduce<string | null>((latest, e) => {
    const iso = e.updatedAt.toISOString();
    return latest === null || iso > latest ? iso : latest;
  }, null);

  const current: DashboardCurrent = {
    year,
    gwpSet: (gwpByYear.get(year) ?? resolveGwpSet(year)) as GwpSet,
    facilityCount: facilityId ? 1 : new Set(scopedYears.filter((ry) => ry.year === year).map((ry) => ry.facilityId)).size,
    lastUpdated,
    total,
    yearTotal,
    totalScopeLabel: category ? null : scope,
    totalCategoryLabel: category,
    byScope,
    byCategory,
    byGas,
    monthly: rollup.scope2Monthly,
    biogenicTonnes: rollup.biogenicTonnes,
    removalsTonnes: rollup.removals.tonnes,
    missingGridFactor: rollup.missingGridFactor,
    unpricedCount: rollup.unpricedCount,
  };

  // Year over year: the most recent year strictly below the selected one that has data. Reuse the
  // already-rolled-up entry so the comparison year keeps its `incomplete` flag: comparing against
  // a year whose Scope 2 could not be priced is not a reduction, it is a missing number.
  const previousYear = years.filter((y) => y < year).sort((a, b) => b - a)[0];
  const previous: YearTotal | null =
    previousYear !== undefined
      ? yearComparison.find((c) => c.year === previousYear) ?? {
          year: previousYear,
          tonnes: 0,
          incomplete: true,
        }
      : null;

  // Per-sede split of the selected year, on the all-facilities view only: the client's Power BI
  // reference shows "Emisiones por sede", and a single-facility view has nothing to compare.
  let bySede: SedeTotal[] = [];
  if (!facilityId) {
    const nameByFacility = new Map(facilities.map((f) => [f.id, f.name]));
    bySede = scopedYears
      .filter((ry) => ry.year === year)
      .map((ry) => {
        const r = rollupForIds([ry.id], year);
        return {
          facilityId: ry.facilityId,
          name: nameByFacility.get(ry.facilityId) ?? "",
          tonnes: r.totalTonnes,
          incomplete: r.missingGridFactor || r.unpricedCount > 0,
        };
      })
      .sort((a, b) => b.tonnes - a.tonnes);
    if (bySede.length < 2) bySede = [];
  }

  // The reduction goal is always company-wide (every facility, every Alcance), regardless of
  // any facility filter active on this view - it is set once on the Empresa screen, not per
  // Sede. Computed from a dedicated fetch rather than the facility-scoped `entries` above,
  // since that array may exclude the baseline year's facility entirely when a filter is active.
  const companyTarget: CompanyTargetProgress | null = companyTargetRow
    ? await loadCompanyTargetProgress(
        companyId,
        reportingYears,
        companyFirstYear,
        year,
        Number(companyTargetRow.reductionPct),
      )
    : null;

  return {
    company: companyVM,
    facilities,
    years,
    filters: { facilityId, year, scope, category },
    current,
    previous,
    yearComparison,
    bySede,
    companyTarget,
    isEmpty: false,
  };
}

// The company's reduction-goal progress: baseline year's company-wide total vs. the currently
// selected year's company-wide total, both computed fresh here rather than reused from the
// facility-scoped rollup above, which may not cover the baseline year's facility at all when a
// facility filter is active.
async function loadCompanyTargetProgress(
  companyId: string,
  allReportingYears: { id: string; facilityId: string; year: number; gwpSet: GwpSet }[],
  baselineYear: number,
  selectedYear: number,
  reductionPct: number,
): Promise<CompanyTargetProgress> {
  const idsFor = (y: number) => allReportingYears.filter((ry) => ry.year === y).map((ry) => ry.id);
  const baselineIds = idsFor(baselineYear);
  const currentIds = idsFor(selectedYear);

  const [entries, gridFactors, subsidyPrices] = await Promise.all([
    prisma.activityEntry.findMany({
      where: { companyId, reportingYearId: { in: [...baselineIds, ...currentIds] } },
      select: {
        reportingYearId: true,
        scope: true,
        category: true,
        subcategory: true,
        element: true,
        month: true,
        value: true,
        secondaryValue: true,
        emissionFactor: {
          select: {
            co2Factor: true,
            ch4Factor: true,
            n2oFactor: true,
            co2eFactor: true,
            biogenic: true,
            entryMode: true,
          },
        },
      },
    }),
    prisma.gridElectricityFactor.findMany({
      where: { year: { in: [baselineYear, selectedYear] } },
      select: { year: true, factor: true },
    }),
    prisma.transportSubsidyPrice.findMany({
      where: { year: { in: [baselineYear, selectedYear] } },
      select: { year: true, pricePerGallonCop: true },
    }),
  ]);

  const gridByYear = new Map(gridFactors.map((g) => [g.year, g.factor.toString()]));
  const priceByYear = new Map(subsidyPrices.map((p) => [p.year, p.pricePerGallonCop.toString()]));
  const gwpByYear = new Map(allReportingYears.map((ry) => [ry.year, ry.gwpSet]));

  const rollFor = (ids: string[], targetYear: number) =>
    rollupYear({
      entries: toRollupEntries(entries.filter((e) => ids.includes(e.reportingYearId))),
      gridFactor: gridByYear.get(targetYear) ?? null,
      pricePerGallon: priceByYear.get(targetYear) ?? null,
      gwpSet: (gwpByYear.get(targetYear) ?? resolveGwpSet(targetYear)) as GwpSet,
    }).totalTonnes;

  const baselineTonnes = rollFor(baselineIds, baselineYear);
  const currentTonnes = rollFor(currentIds, selectedYear);

  return {
    reductionPct,
    baselineYear,
    baselineTonnes,
    currentYear: selectedYear,
    currentTonnes,
    actualReductionPct:
      baselineTonnes > 0 ? ((baselineTonnes - currentTonnes) / baselineTonnes) * 100 : 0,
  };
}
