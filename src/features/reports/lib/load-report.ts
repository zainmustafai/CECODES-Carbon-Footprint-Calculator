import { prisma } from "@/lib/prisma";
import { rollupYear, type RollupEntry } from "@/lib/calc/rollup";
import { toRollupEntries } from "@/lib/calc/rollup-entries";
import { isValidEntryValue, normalizeDecimalInput } from "@/lib/decimal-input";
import type { GwpSet } from "@/lib/generated/prisma/client";
import type { ActivityRow, ReportVM, ResultRow, SedeTotal } from "./types";

// Builds the export for one facility (or, when facilityId is null, an entire company) and
// reporting year.
//
// EVERY computed number here comes out of rollupYear, the same function that feeds the dashboard.
// Nothing in this file multiplies an activity by a factor. That is deliberate and it is the whole
// point: this file produces the artifact CECODES will diff against their spreadsheet, so if it did
// its own arithmetic, any shortcut in it would read to them as a calculation bug in the product.
// The raw entries are used only for the as-entered activity sheet and for element metadata.

type Decimalish = { toString(): string };

// The full row shape both the rollup (via toRollupEntries) and the meta-join below need.
// A superset of RollupSourceRow - toRollupEntries only reads the fields it declares, and
// TypeScript's excess-property check only fires on object literals, not on a variable like
// this, so passing an EntryRow[] to toRollupEntries() is safe.
type EntryRow = {
  reportingYearId: string;
  scope: RollupEntry["scope"];
  category: string;
  subcategory: string | null;
  element: string;
  unit: string;
  month: number | null;
  value: Decimalish | null;
  emissionFactor: {
    co2Factor: Decimalish | null;
    ch4Factor: Decimalish | null;
    n2oFactor: Decimalish | null;
    co2eFactor: Decimalish | null;
    factorUnit: string | null;
    biogenic: boolean;
    uncertaintyPct: Decimalish | null;
  } | null;
};

type CleanTechRow = {
  scope: RollupEntry["scope"] | null;
  element: string;
  quantity: Decimalish | null;
  unit: string | null;
};

/** Sums an element's reported activity for the quantity column. Display-only, like the roll-up. */
function toNumber(value: string | null): number {
  if (value === null) return 0;
  const normalized = normalizeDecimalInput(value);
  if (normalized === "" || !isValidEntryValue(normalized)) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

// The per-element/meta-join computation shared by both loaders below. It only cares about
// entries, never which facility they came from, so the multi-facility union works unmodified.
function buildReportFromEntries({
  entries,
  cleanTechRows,
  gridFactor,
  gwpSet,
}: {
  entries: EntryRow[];
  cleanTechRows: CleanTechRow[];
  gridFactor: string | null;
  gwpSet: GwpSet;
}): Pick<
  ReportVM,
  | "activity"
  | "results"
  | "byScope"
  | "byCategory"
  | "totalTonnes"
  | "removals"
  | "cleanTech"
  | "biogenicTonnes"
  | "biogenicCo2Tonnes"
  | "biogenicCo2Partial"
  | "missingGridFactor"
  | "unpricedCount"
> {
  const rollupEntries: RollupEntry[] = toRollupEntries(entries);
  const rollup = rollupYear({ entries: rollupEntries, gridFactor, gwpSet });

  // What the company entered. No arithmetic.
  const activity: ActivityRow[] = entries.map((entry) => ({
    scope: entry.scope,
    category: entry.category,
    subcategory: entry.subcategory,
    element: entry.element,
    unit: entry.unit,
    month: entry.month,
    value: entry.value === null ? null : entry.value.toString(),
  }));

  // Element metadata (unit, factor) keyed the same way rollupYear keys its element totals, so the
  // two can be joined without either side re-deriving anything.
  const key = (e: {
    scope: string;
    category: string;
    subcategory: string | null;
    element: string;
  }) => `${e.scope}::${e.category}::${e.subcategory ?? ""}::${e.element}`;

  const meta = new Map<
    string,
    {
      unit: string;
      factorValue: string | null;
      factorUnit: string | null;
      quantity: number;
      uncertaintyPct: string | null;
    }
  >();

  for (const entry of entries) {
    const k = key(entry);
    const existing = meta.get(k);
    const quantity = toNumber(entry.value === null ? null : entry.value.toString());

    if (existing) {
      existing.quantity += quantity;
      continue;
    }

    const factor = entry.emissionFactor;
    meta.set(k, {
      unit: entry.unit,
      quantity,
      // Scope 2 is priced by the national grid factor, not by a factor on the row.
      factorValue:
        entry.scope === "SCOPE_2"
          ? gridFactor
          : factor?.co2eFactor?.toString() ??
            factor?.co2Factor?.toString() ??
            factor?.ch4Factor?.toString() ??
            factor?.n2oFactor?.toString() ??
            null,
      factorUnit: entry.scope === "SCOPE_2" ? "kg CO2/kWh" : factor?.factorUnit ?? null,
      // Grid electricity carries no uncertainty in the library; only per-element factors do.
      uncertaintyPct:
        entry.scope === "SCOPE_2" ? null : factor?.uncertaintyPct?.toString() ?? null,
    });
  }

  // The results sheet IS rollupYear's element roll-up. An element that the engine excluded (no
  // factor, unreadable factor, no grid factor) is absent here too, rather than showing a zero:
  // the disclosures below say how many were dropped.
  const toResultRow = (element: (typeof rollup.byElement)[number]): ResultRow => {
    const m = meta.get(key(element));
    return {
      scope: element.scope,
      category: element.category,
      subcategory: element.subcategory,
      element: element.element,
      unit: m?.unit ?? "",
      quantity: m?.quantity ?? 0,
      factorValue: m?.factorValue ?? null,
      factorUnit: m?.factorUnit ?? null,
      tonnes: element.tonnes,
      uncertaintyPct: m?.uncertaintyPct ?? null,
    };
  };

  const results: ResultRow[] = rollup.byElement.map(toResultRow);
  // Removals come out of the same engine but live in their own section, never in the totals.
  const removalRows: ResultRow[] = rollup.removals.byElement.map(toResultRow);

  return {
    activity,
    results,
    byScope: (["SCOPE_1", "SCOPE_2", "SCOPE_3"] as const).map((scope) => ({
      scope,
      tonnes: rollup.byScope[scope],
    })),
    byCategory: rollup.byCategory,
    totalTonnes: rollup.totalTonnes,
    removals: { rows: removalRows, tonnes: rollup.removals.tonnes },
    cleanTech: cleanTechRows.map((row) => ({
      scope: row.scope,
      element: row.element,
      quantity: row.quantity === null ? null : row.quantity.toString(),
      unit: row.unit,
    })),
    biogenicTonnes: rollup.biogenicTonnes,
    biogenicCo2Tonnes: rollup.biogenicCo2Tonnes,
    biogenicCo2Partial: rollup.biogenicCo2Partial,
    missingGridFactor: rollup.missingGridFactor,
    unpricedCount: rollup.unpricedCount,
  };
}

const ENTRY_SELECT = {
  reportingYearId: true,
  scope: true,
  category: true,
  subcategory: true,
  element: true,
  unit: true,
  month: true,
  value: true,
  emissionFactor: {
    select: {
      co2Factor: true,
      ch4Factor: true,
      n2oFactor: true,
      co2eFactor: true,
      factorUnit: true,
      biogenic: true,
      uncertaintyPct: true,
    },
  },
} as const;

async function loadSingleFacilityReport(
  companyId: string,
  facilityId: string,
  year: number,
): Promise<ReportVM | null> {
  const [company, facility, reportingYear] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    // Scoped on companyId as well as id: never trust a facility id on its own.
    prisma.facility.findFirst({
      where: { id: facilityId, companyId },
      select: { name: true },
    }),
    prisma.reportingYear.findFirst({
      where: { facilityId, companyId, year },
      select: { id: true, year: true, gwpSet: true },
    }),
  ]);

  if (!company || !facility || !reportingYear) return null;

  const [entries, grid, cleanTechRows] = await Promise.all([
    prisma.activityEntry.findMany({
      where: { reportingYearId: reportingYear.id, companyId },
      orderBy: [
        { scope: "asc" },
        { category: "asc" },
        { subcategory: "asc" },
        { element: "asc" },
        { month: "asc" },
      ],
      select: ENTRY_SELECT,
    }),
    prisma.gridElectricityFactor.findUnique({
      where: { year: reportingYear.year },
      select: { factor: true },
    }),
    prisma.cleanTechEntry.findMany({
      where: { reportingYearId: reportingYear.id, companyId },
      orderBy: { createdAt: "asc" },
      select: {
        scope: true,
        element: true,
        quantity: true,
        unit: true,
      },
    }),
  ]);

  const gridFactor = grid ? grid.factor.toString() : null;
  const gwpSet = reportingYear.gwpSet as GwpSet;

  const built = buildReportFromEntries({ entries, cleanTechRows, gridFactor, gwpSet });

  return {
    companyName: company.name,
    facilityName: facility.name,
    year: reportingYear.year,
    gwpSet,
    gridFactor,
    bySede: [],
    ...built,
    generatedAt: new Date(),
  };
}

async function loadCompanyWideReport(companyId: string, year: number): Promise<ReportVM | null> {
  const [company, facilities, reportingYears] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    prisma.facility.findMany({ where: { companyId }, select: { id: true, name: true } }),
    // @@unique([facilityId, year]) guarantees at most one row per facility for this year.
    prisma.reportingYear.findMany({
      where: { companyId, year },
      select: { id: true, facilityId: true, gwpSet: true },
    }),
  ]);

  if (!company || reportingYears.length === 0) return null;

  const reportingYearIds = reportingYears.map((ry) => ry.id);
  const nameByFacility = new Map(facilities.map((f) => [f.id, f.name]));
  // The schema's own resolveGwpSet convention: every facility's row for the same calendar year
  // carries the same value (it is derived from the year at creation, never a per-facility
  // choice), so any one of them is representative.
  const gwpSet = reportingYears[0].gwpSet as GwpSet;

  const [entries, grid, cleanTechRows] = await Promise.all([
    prisma.activityEntry.findMany({
      where: { reportingYearId: { in: reportingYearIds }, companyId },
      orderBy: [
        { scope: "asc" },
        { category: "asc" },
        { subcategory: "asc" },
        { element: "asc" },
        { month: "asc" },
      ],
      select: ENTRY_SELECT,
    }),
    prisma.gridElectricityFactor.findUnique({
      where: { year },
      select: { factor: true },
    }),
    prisma.cleanTechEntry.findMany({
      where: { reportingYearId: { in: reportingYearIds }, companyId },
      orderBy: { createdAt: "asc" },
      select: {
        scope: true,
        element: true,
        quantity: true,
        unit: true,
      },
    }),
  ]);

  const gridFactor = grid ? grid.factor.toString() : null;

  const built = buildReportFromEntries({ entries, cleanTechRows, gridFactor, gwpSet });

  // Per-sede subtotal: the same rollup, scoped to one facility's own entries, mirroring
  // dashboard-data.ts's own per-facility rollupForIds usage.
  const entriesByReportingYear = new Map<string, EntryRow[]>();
  for (const entry of entries) {
    const list = entriesByReportingYear.get(entry.reportingYearId) ?? [];
    list.push(entry);
    entriesByReportingYear.set(entry.reportingYearId, list);
  }
  const bySede: SedeTotal[] = reportingYears
    .map((ry) => {
      const facilityEntries = entriesByReportingYear.get(ry.id) ?? [];
      const rollup = rollupYear({
        entries: toRollupEntries(facilityEntries),
        gridFactor,
        gwpSet,
      });
      return {
        facilityId: ry.facilityId,
        facilityName: nameByFacility.get(ry.facilityId) ?? "",
        tonnes: rollup.totalTonnes,
        incomplete: rollup.missingGridFactor || rollup.unpricedCount > 0,
      };
    })
    .sort((a, b) => b.tonnes - a.tonnes);

  return {
    companyName: company.name,
    facilityName: null,
    year,
    gwpSet,
    gridFactor,
    bySede,
    ...built,
    generatedAt: new Date(),
  };
}

export async function loadReport(
  companyId: string,
  facilityId: string | null,
  year: number,
): Promise<ReportVM | null> {
  return facilityId
    ? loadSingleFacilityReport(companyId, facilityId, year)
    : loadCompanyWideReport(companyId, year);
}
