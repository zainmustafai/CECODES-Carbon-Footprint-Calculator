import { prisma } from "@/lib/prisma";
import { rollupYear, type RollupEntry } from "@/lib/calc/rollup";
import { toRollupEntries } from "@/lib/calc/rollup-entries";
import { formatEnteredActivity } from "@/lib/calc/format-entered-activity";
import { isValidEntryValue, normalizeDecimalInput } from "@/lib/decimal-input";
import { toFuelPrices, type FuelPrices, type FuelType } from "@/lib/calc/fuel";
import type { EntryMode, GwpSet, Scope } from "@/lib/generated/prisma/client";
import type { ActivityRow, ReportVM, ResultRow, SedeTotal } from "./types";
import { filterReportVM } from "./filter-report";
import type { CompanyProfile } from "./types";

/** The company header block, straight off the Company row. Every field is optional: the header
 *  prints only the ones the company filled in (client feedback 2026-09-03, D5). employeeCount is
 *  an Int, not a Decimal, so it crosses as a number and a genuine 0 still renders. */
function toCompanyProfile(company: {
  sector: string | null;
  contactEmail: string | null;
  nit: string | null;
  employeeCount: number | null;
  contactName: string | null;
  contactRole: string | null;
  contactPhone: string | null;
  website: string | null;
}): CompanyProfile {
  return {
    sector: company.sector,
    contactEmail: company.contactEmail,
    nit: company.nit,
    employeeCount: company.employeeCount,
    contactName: company.contactName,
    contactRole: company.contactRole,
    contactPhone: company.contactPhone,
    website: company.website,
  };
}

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
  secondaryValue: Decimalish | null;
  /** The routes of a COUNT_TIMES_DISTANCE source; toRollupEntries turns them into the strings
   *  rollupYear sums. Empty for every other source and for one entered before trip rows existed. */
  trips: { count: Decimalish; distanceKm: Decimalish }[];
  emissionFactor: {
    co2Factor: Decimalish | null;
    ch4Factor: Decimalish | null;
    n2oFactor: Decimalish | null;
    co2eFactor: Decimalish | null;
    factorUnit: string | null;
    biogenic: boolean;
    uncertaintyPct: Decimalish | null;
    entryMode: EntryMode;
    gasType: string | null;
    fuelType: FuelType | null;
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
  fuelPrices,
  gwpSet,
}: {
  entries: EntryRow[];
  cleanTechRows: CleanTechRow[];
  gridFactor: string | null;
  /** Both of the year's average prices per gallon: a transport subsidy divides by the one its
   *  own factor names. */
  fuelPrices: FuelPrices | null;
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
  | "missingTransportSubsidyPrice"
  | "unpricedCount"
  | "monthly"
> {
  const rollupEntries: RollupEntry[] = toRollupEntries(entries);
  const rollup = rollupYear({ entries: rollupEntries, gridFactor, fuelPrices, gwpSet });

  // What the company entered. No arithmetic - formatEnteredActivity only relabels the unit and
  // surfaces secondaryValue; it never touches the Decimal strings themselves (rollupYear does the
  // actual division/multiplication for entry modes that reinterpret the stored number).
  const activity: ActivityRow[] = entries.map((entry) => {
    const entryMode = entry.emissionFactor?.entryMode ?? "QUANTITY";
    // A source with routes stores the sum of their products in `value` and 1 in `secondaryValue`,
    // so the count-and-distance labels would print a meaningless "1 km" beside it here too. The
    // route count makes formatEnteredActivity keep the factor's whole unit and drop the second
    // column, which is what the as-entered sheet should show for that source.
    const tripCount = entry.trips.length;
    const labels = formatEnteredActivity({
      entryMode,
      value: null,
      secondaryValue: null,
      unit: entry.unit,
      tripCount,
    });
    return {
      scope: entry.scope,
      category: entry.category,
      subcategory: entry.subcategory,
      element: entry.element,
      unit: labels.unit,
      month: entry.month,
      value: entry.value === null ? null : entry.value.toString(),
      secondaryValue:
        entryMode === "COUNT_TIMES_DISTANCE" && tripCount === 0 && entry.secondaryValue !== null
          ? entry.secondaryValue.toString()
          : null,
      secondaryUnit: labels.secondaryUnit,
    };
  });

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
      entryMode: EntryMode;
      factorValue: string | null;
      factorUnit: string | null;
      quantity: number;
      secondaryQuantity: number;
      /** How many routes the source carries, summed across its rows. Zero for every source that
       *  is not a COUNT_TIMES_DISTANCE one, and for one entered before trip rows existed. */
      tripCount: number;
      uncertaintyPct: string | null;
    }
  >();

  for (const entry of entries) {
    const k = key(entry);
    const existing = meta.get(k);
    const quantity = toNumber(entry.value === null ? null : entry.value.toString());
    const secondaryQuantity = toNumber(
      entry.secondaryValue === null ? null : entry.secondaryValue.toString(),
    );

    if (existing) {
      existing.quantity += quantity;
      existing.secondaryQuantity += secondaryQuantity;
      existing.tripCount += entry.trips.length;
      continue;
    }

    const factor = entry.emissionFactor;
    // A Scope 2 element's OWN per-kWh factor, when it has one (the RECs element, worth 0).
    const scope2Own =
      entry.scope === "SCOPE_2" ? factor?.co2eFactor ?? factor?.co2Factor ?? null : null;
    meta.set(k, {
      unit: entry.unit,
      entryMode: factor?.entryMode ?? "QUANTITY",
      quantity,
      secondaryQuantity,
      tripCount: entry.trips.length,
      // Scope 2 is priced by the national grid factor UNLESS the element carries its own per-kWh
      // value, which is how REC-backed electricity prices at zero. This has to follow exactly the
      // rule rollupYear applies (scope2RatePerKwh), or the report would print the grid factor
      // beside a tonnage the grid factor did not produce.
      factorValue:
        entry.scope === "SCOPE_2"
          ? scope2Own?.toString() ?? gridFactor
          : factor?.co2eFactor?.toString() ??
            factor?.co2Factor?.toString() ??
            factor?.ch4Factor?.toString() ??
            factor?.n2oFactor?.toString() ??
            null,
      factorUnit:
        entry.scope === "SCOPE_2"
          ? scope2Own !== null
            ? factor?.factorUnit ?? "kg CO2e/kWh"
            : "kg CO2/kWh"
          : factor?.factorUnit ?? null,
      // Grid electricity carries no uncertainty in the library; only per-element factors do.
      uncertaintyPct:
        entry.scope === "SCOPE_2" && scope2Own === null
          ? null
          : factor?.uncertaintyPct?.toString() ?? null,
    });
  }

  // The results sheet IS rollupYear's element roll-up. An element that the engine excluded (no
  // factor, unreadable factor, no grid factor) is absent here too, rather than showing a zero:
  // the disclosures below say how many were dropped.
  const toResultRow = (element: (typeof rollup.byElement)[number]): ResultRow => {
    const m = meta.get(key(element));
    const labels = formatEnteredActivity({
      entryMode: m?.entryMode ?? "QUANTITY",
      value: m?.quantity ?? 0,
      secondaryValue: m?.secondaryQuantity ?? 0,
      unit: m?.unit ?? "",
      // With routes, value is already the sum of their products and secondaryValue is 1, so the
      // count-and-distance labels would print "8.400 ton x 1 km". Naming the route count makes
      // formatEnteredActivity keep the whole unit instead.
      tripCount: m?.tripCount ?? 0,
    });
    return {
      scope: element.scope,
      category: element.category,
      subcategory: element.subcategory,
      element: element.element,
      unit: labels.unit,
      quantity: labels.value ?? 0,
      secondaryQuantity: m?.entryMode === "COUNT_TIMES_DISTANCE" ? labels.secondaryValue : null,
      secondaryUnit: labels.secondaryUnit,
      factorValue: m?.factorValue ?? null,
      factorUnit: m?.factorUnit ?? null,
      tonnes: element.tonnes,
      gases: element.gases,
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
    missingTransportSubsidyPrice: rollup.missingTransportSubsidyPrice,
    unpricedCount: rollup.unpricedCount,
    monthly: rollup.scope2Monthly,
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
  secondaryValue: true,
  // One row per route for a COUNT_TIMES_DISTANCE source: the engine sums each row's own product,
  // so a report that did not load them would fall back to the pre-trip approximation.
  trips: {
    select: { count: true, distanceKm: true },
    orderBy: { position: "asc" },
  },
  emissionFactor: {
    select: {
      co2Factor: true,
      ch4Factor: true,
      n2oFactor: true,
      co2eFactor: true,
      factorUnit: true,
      biogenic: true,
      uncertaintyPct: true,
      entryMode: true,
      // Without this the report buckets every pre-blended HFC/PFC/SF6/NF3 as "Otros gases sin
      // identificar" while the dashboard, whose query does select it, names the same gases: one
      // dataset, two answers. It is also what the ISO 14064-1 declaration keys its columns on.
      gasType: true,
      // Same class of bug for the C6 subsidies: without the fuel the engine cannot tell which of
      // the year's two prices to divide by, and reports the whole subsidy as unpriced.
      fuelType: true,
    },
  },
} as const;

async function loadSingleFacilityReport(
  companyId: string,
  facilityId: string,
  year: number,
): Promise<ReportVM | null> {
  const [company, facility, reportingYear] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        name: true,
        sector: true,
        contactEmail: true,
        nit: true,
        employeeCount: true,
        contactName: true,
        contactRole: true,
        contactPhone: true,
        website: true,
      },
    }),
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

  const [entries, grid, subsidyPrices, cleanTechRows] = await Promise.all([
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
    prisma.transportSubsidyPrice.findMany({
      where: { year: reportingYear.year },
      select: { fuel: true, pricePerGallonCop: true },
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
  const fuelPrices = toFuelPrices(subsidyPrices);
  const gwpSet = reportingYear.gwpSet as GwpSet;

  const built = buildReportFromEntries({ entries, cleanTechRows, gridFactor, fuelPrices, gwpSet });

  return {
    companyName: company.name,
    companyProfile: toCompanyProfile(company),
    facilityName: facility.name,
    year: reportingYear.year,
    gwpSet,
    gridFactor,
    bySede: [],
    ...built,
    appliedFilters: { scope: [], category: null },
    generatedAt: new Date(),
  };
}

async function loadCompanyWideReport(companyId: string, year: number): Promise<ReportVM | null> {
  const [company, facilities, reportingYears] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        name: true,
        sector: true,
        contactEmail: true,
        nit: true,
        employeeCount: true,
        contactName: true,
        contactRole: true,
        contactPhone: true,
        website: true,
      },
    }),
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

  const [entries, grid, subsidyPrices, cleanTechRows] = await Promise.all([
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
    prisma.transportSubsidyPrice.findMany({
      where: { year },
      select: { fuel: true, pricePerGallonCop: true },
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
  const fuelPrices = toFuelPrices(subsidyPrices);

  const built = buildReportFromEntries({ entries, cleanTechRows, gridFactor, fuelPrices, gwpSet });

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
        fuelPrices,
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
    companyProfile: toCompanyProfile(company),
    facilityName: null,
    year,
    gwpSet,
    gridFactor,
    bySede,
    ...built,
    appliedFilters: { scope: [], category: null },
    generatedAt: new Date(),
  };
}

export async function loadReport(
  companyId: string,
  facilityId: string | null,
  year: number,
  filters?: { scope?: Scope[]; category?: string | null },
): Promise<ReportVM | null> {
  const vm = facilityId
    ? await loadSingleFacilityReport(companyId, facilityId, year)
    : await loadCompanyWideReport(companyId, year);
  if (!vm) return null;

  const scope = filters?.scope ?? [];
  const category = filters?.category ?? null;
  if (scope.length === 0 && !category) return vm;

  return filterReportVM(vm, { scope, category });
}
