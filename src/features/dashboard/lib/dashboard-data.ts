import { prisma } from "@/lib/prisma";
import { resolveGwpSet } from "@/lib/gwp";
import { rollupYear, type RollupEntry, type YearRollup } from "@/lib/calc/rollup";
import type { GwpSet, Scope } from "@/lib/generated/prisma/client";
import type {
  CategorySlice,
  DashboardCurrent,
  DashboardFilters,
  DashboardVM,
  ScopeSlice,
  TargetRow,
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
    targets: [],
    isEmpty: years.length === 0,
  };

  if (years.length === 0) return emptyVM;

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

  // One pass for every entry, plus the grid factors and this year's targets.
  const [entries, gridFactors, targetRows] = await Promise.all([
    prisma.activityEntry.findMany({
      where: { reportingYearId: { in: allReportingYearIds } },
      select: {
        reportingYearId: true,
        scope: true,
        category: true,
        month: true,
        value: true,
        updatedAt: true,
        emissionFactor: {
          select: {
            co2Factor: true,
            ch4Factor: true,
            n2oFactor: true,
            co2eFactor: true,
            biogenic: true,
          },
        },
      },
    }),
    prisma.gridElectricityFactor.findMany({
      where: { year: { in: years } },
      select: { year: true, factor: true },
    }),
    prisma.scopeTarget.findMany({
      where: { reportingYearId: { in: idsByYear.get(year) ?? [] } },
      select: { scope: true, targetTonnes: true },
    }),
  ]);

  const gridByYear = new Map(gridFactors.map((g) => [g.year, g.factor.toString()]));
  const gwpByYear = new Map(scopedYears.map((ry) => [ry.year, ry.gwpSet]));

  const entriesByReportingYear = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = entriesByReportingYear.get(entry.reportingYearId) ?? [];
    list.push(entry);
    entriesByReportingYear.set(entry.reportingYearId, list);
  }

  // Roll every calendar year up (needed for the comparison chart and year over year).
  function rollupForYear(targetYear: number): YearRollup {
    const ids = idsByYear.get(targetYear) ?? [];
    const rollupEntries: RollupEntry[] = ids.flatMap((id) =>
      (entriesByReportingYear.get(id) ?? []).map((e) => ({
        scope: e.scope,
        category: e.category,
        month: e.month,
        value: e.value === null ? null : e.value.toString(),
        factor: e.emissionFactor
          ? {
              co2Factor: e.emissionFactor.co2Factor?.toString() ?? null,
              ch4Factor: e.emissionFactor.ch4Factor?.toString() ?? null,
              n2oFactor: e.emissionFactor.n2oFactor?.toString() ?? null,
              co2eFactor: e.emissionFactor.co2eFactor?.toString() ?? null,
              biogenic: e.emissionFactor.biogenic,
            }
          : null,
      })),
    );
    return rollupYear({
      entries: rollupEntries,
      gridFactor: gridByYear.get(targetYear) ?? null,
      gwpSet: (gwpByYear.get(targetYear) ?? resolveGwpSet(targetYear)) as GwpSet,
    });
  }

  const yearComparison: YearTotal[] = [...years]
    .sort((a, b) => a - b)
    .map((y) => ({ year: y, tonnes: rollupForYear(y).totalTonnes }));

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
    monthly: rollup.scope2Monthly,
    biogenicTonnes: rollup.biogenicTonnes,
    missingGridFactor: rollup.missingGridFactor,
  };

  // Year over year: the most recent year strictly below the selected one that has data.
  const previousYear = years.filter((y) => y < year).sort((a, b) => b - a)[0];
  const previous: YearTotal | null =
    previousYear !== undefined
      ? { year: previousYear, tonnes: yearComparison.find((c) => c.year === previousYear)?.tonnes ?? 0 }
      : null;

  // Targets are summed per scope across the year's reporting years; actual is the scope total.
  const targetByScope = new Map<Scope, number>();
  for (const row of targetRows) {
    targetByScope.set(row.scope, (targetByScope.get(row.scope) ?? 0) + Number(row.targetTonnes));
  }
  const targets: TargetRow[] = SCOPES.filter((s) => targetByScope.has(s)).map((s) => {
    const targetTonnes = targetByScope.get(s) ?? 0;
    const actualTonnes = rollup.byScope[s];
    return {
      scope: s,
      targetTonnes,
      actualTonnes,
      progressPct: targetTonnes > 0 ? (actualTonnes / targetTonnes) * 100 : 0,
    };
  });

  return {
    company: companyVM,
    facilities,
    years,
    filters: { facilityId, year, scope, category },
    current,
    previous,
    yearComparison,
    targets,
    isEmpty: false,
  };
}
