import { prisma } from "@/lib/prisma";
import { isValidEntryValue, normalizeDecimalInput } from "@/lib/decimal-input";
import { estimateSourceTonnes, type SourceEstimate } from "@/lib/calc/preview";
import { REMOVALS_CATEGORY, rollupYear } from "@/lib/calc/rollup";
import { toRollupEntries } from "@/lib/calc/rollup-entries";
import { toFuelPrices } from "@/lib/calc/fuel";
import { formatEnteredActivity } from "@/lib/calc/format-entered-activity";
import type { EntryMode, GwpSet, Scope } from "@/lib/generated/prisma/client";
import { shapeEntries, type EntryRow } from "@/features/data-entry/lib/shape-entries";
import type { GroupedFactors } from "@/features/data-entry/lib/types";
import type {
  PreviewCategoryGroup,
  PreviewSedeTotal,
  PreviewSourceRow,
  PreviewScopeGroup,
  PreviewVM,
} from "./types";

// shapeEntries seeds its category list from the factor library so empty categories still
// render in the data-entry form. The preview only wants what the company actually entered, so
// it is fed an empty library and shapeEntries produces categories from the entries alone.
const NO_LIBRARY: GroupedFactors = { SCOPE_1: [], SCOPE_2: [], SCOPE_3: [] };

// Sums a source's reported activity for display. Floats are fine here and only here: nothing
// in the preview is persisted, and every value is labelled "estimación referencial". The
// rollup engine (lib/calc/rollup.ts) recomputes official totals from the stored Decimal strings.
function toNumber(value: string): number {
  const normalized = normalizeDecimalInput(value);
  if (normalized === "" || !isValidEntryValue(normalized)) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function empty(
  facilities: PreviewVM["facilities"],
  filters: PreviewVM["filters"],
  reason: PreviewVM["emptyReason"],
  years: number[] = [],
): PreviewVM {
  return {
    facilities,
    years,
    filters,
    selectedFacilityName: null,
    gwpSet: null,
    scopes: [],
    totalTonnes: 0,
    biogenicTonnes: 0,
    bySede: [],
    removals: null,
    cleanTech: [],
    missingGridFactor: false,
    missingTransportSubsidyPrice: false,
    isEmpty: true,
    emptyReason: reason,
  };
}

// Builds the read-only preview for one facility and reporting year: every entered source
// grouped by scope and category, with its display-only estimated emissions.
export async function loadPreview(
  companyId: string,
  requested: { facilityId: string | null; year: number | null },
): Promise<PreviewVM> {
  const facilities = await prisma.facility.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const facilityId =
    requested.facilityId && facilities.some((f) => f.id === requested.facilityId)
      ? requested.facilityId
      : facilities[0]?.id ?? null;

  if (!facilityId) return empty(facilities, { facilityId: null, year: null }, "noFacility");

  const reportingYears = await prisma.reportingYear.findMany({
    where: { facilityId, companyId },
    orderBy: { year: "desc" },
    select: { id: true, year: true, gwpSet: true },
  });
  const years = reportingYears.map((y) => y.year);

  if (reportingYears.length === 0) {
    return empty(facilities, { facilityId, year: null }, "noYear");
  }

  const selectedYear =
    reportingYears.find((y) => y.year === requested.year) ?? reportingYears[0];

  const [entries, gridFactor, subsidyPrices, cleanTechRows] = await Promise.all([
    prisma.activityEntry.findMany({
      where: { reportingYearId: selectedYear.id, companyId },
      orderBy: [{ category: "asc" }, { element: "asc" }, { month: "asc" }],
      select: {
        id: true,
        emissionFactorId: true,
        scope: true,
        category: true,
        subcategory: true,
        element: true,
        unit: true,
        month: true,
        value: true,
        secondaryValue: true,
        // The Resumen only needs to know a source HAS routes, but shapeEntries hands the whole
        // TripVM to the cell, so the same shape is selected here as on the entry screen.
        trips: {
          select: { reference: true, count: true, distanceKm: true, note: true },
          orderBy: { position: "asc" as const },
        },
        emissionFactor: {
          select: {
            active: true,
            biogenic: true,
            co2Factor: true,
            ch4Factor: true,
            n2oFactor: true,
            co2eFactor: true,
            factorUnit: true,
            source: true,
            entryMode: true,
            gasType: true,
            // Which of the year's two average prices a transport subsidy divides by; without it
            // every C6 subsidy would show as missing a price.
            fuelType: true,
          },
        },
      },
    }),
    prisma.gridElectricityFactor.findUnique({
      where: { year: selectedYear.year },
      select: { factor: true, source: true },
    }),
    prisma.transportSubsidyPrice.findMany({
      where: { year: selectedYear.year },
      select: { fuel: true, pricePerGallonCop: true, source: true },
    }),
    prisma.cleanTechEntry.findMany({
      where: { reportingYearId: selectedYear.id, companyId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        scope: true,
        element: true,
        quantity: true,
        unit: true,
      },
    }),
  ]);

  // Free-form reporting rows, verbatim. Decimals cross as strings; no arithmetic ever runs.
  const cleanTech = cleanTechRows.map((row) => ({
    id: row.id,
    scope: row.scope,
    element: row.element,
    quantity: row.quantity === null ? null : row.quantity.toString(),
    unit: row.unit,
  }));

  const facilityName = facilities.find((f) => f.id === facilityId)?.name ?? null;
  const baseFilters = { facilityId, year: selectedYear.year };

  // "No data" only when NOTHING was reported: a year with only free-form clean-tech rows still
  // has something worth showing, so it falls through to the main path (with zeroed totals).
  if (entries.length === 0 && cleanTech.length === 0) {
    return {
      ...empty(facilities, baseFilters, "noData", years),
      selectedFacilityName: facilityName,
      gwpSet: selectedYear.gwpSet,
    };
  }

  // Decimals cross the boundary as strings and stay strings until the estimate engine, which
  // is display-only. Number() is never called on a stored value except behind normalization.
  const entryRows: EntryRow[] = entries.map((entry) => ({
    id: entry.id,
    emissionFactorId: entry.emissionFactorId,
    scope: entry.scope,
    category: entry.category,
    subcategory: entry.subcategory,
    element: entry.element,
    unit: entry.unit,
    month: entry.month,
    value: entry.value === null ? "" : entry.value.toString(),
    secondaryValue: entry.secondaryValue === null ? "" : entry.secondaryValue.toString(),
    // The routes behind a COUNT_TIMES_DISTANCE source. Only the COUNT is used downstream:
    // saveTransportTrips stores the sum of their products in `value` and 1 in `secondaryValue`,
    // so without knowing routes exist the Resumen would label the source "8.400 ton x 1 km"
    // instead of "8.400 ton * km".
    trips: entry.trips.map((trip) => ({
      reference: trip.reference ?? "",
      count: trip.count.toString(),
      distanceKm: trip.distanceKm.toString(),
      note: trip.note ?? "",
    })),
    factorActive: entry.emissionFactor?.active ?? false,
    biogenic: entry.emissionFactor?.biogenic ?? false,
    entryMode: entry.emissionFactor?.entryMode ?? "QUANTITY",
    factor: entry.emissionFactor
      ? {
          co2Factor: entry.emissionFactor.co2Factor?.toString() ?? null,
          ch4Factor: entry.emissionFactor.ch4Factor?.toString() ?? null,
          n2oFactor: entry.emissionFactor.n2oFactor?.toString() ?? null,
          co2eFactor: entry.emissionFactor.co2eFactor?.toString() ?? null,
          biogenic: entry.emissionFactor.biogenic,
          factorUnit: entry.emissionFactor.factorUnit,
          source: entry.emissionFactor.source,
          entryMode: entry.emissionFactor.entryMode,
          // Which gas a pre-blended factor actually is. The query has always selected it; not
          // passing it here made listFactorGases fall back to the anonymous "CO2e" label, so the
          // same refrigerant read "SF6" on the data-entry summary and "CO2e" on the Resumen.
          gasType: entry.emissionFactor.gasType,
          fuelType: entry.emissionFactor.fuelType,
        }
      : null,
  }));

  const gridFactorVM = gridFactor
    ? { factor: gridFactor.factor.toString(), source: gridFactor.source }
    : null;
  // Both of the year's average prices, folded into the two-slot shape the estimate takes: a
  // gasoline subsidy divides by the gasoline price and a diesel one by the diesel price. The
  // provenance line is the first row's, since both averages come from the same published table.
  const pricePerGallonVM =
    subsidyPrices.length > 0
      ? { prices: toFuelPrices(subsidyPrices), source: subsidyPrices[0].source }
      : null;
  const gwpSet = selectedYear.gwpSet as GwpSet;

  const shaped = shapeEntries(entryRows, [], NO_LIBRARY);

  let totalTonnes = 0;
  let biogenicTonnes = 0;
  let missingGridFactor = false;
  let missingTransportSubsidyPrice = false;
  // Removals (category "Remociones") get their own table with their own negative total,
  // exactly as the client's Excel separates BASE_remociones. They never enter a scope total.
  let removals: PreviewVM["removals"] = null;

  const scopes: PreviewScopeGroup[] = shaped.map((scopeVM) => {
    let scopeTonnes = 0;

    const categories = scopeVM.categories
      // A scope's library categories are absent (NO_LIBRARY), so every category here has
      // sources. Guard anyway: an applies-only category could arrive with none.
      .filter((category) => category.sources.length > 0)
      .map((category) => {
        let categoryTonnes = 0;

        const sources: PreviewSourceRow[] = category.sources.map((source) => {
          const values = source.cells.map((cell) => cell.value);
          const secondaryValues = source.cells.map((cell) => cell.secondaryValue);
          const estimate = estimateSourceTonnes({
            values,
            secondaryValues,
            scope: source.scope,
            category: source.category,
            factor: source.factor,
            gridFactor: gridFactorVM,
            pricePerGallon: pricePerGallonVM,
            gwpSet,
          });

          if (estimate.kind === "missingGridFactor") missingGridFactor = true;
          if (estimate.kind === "missingTransportSubsidyPrice") missingTransportSubsidyPrice = true;

          let quantity = 0;
          let secondaryQuantity = 0;
          let hasQuantity = false;
          for (const value of values) {
            if (value === "") continue;
            quantity += toNumber(value);
            hasQuantity = true;
          }
          for (const value of secondaryValues) {
            if (value === "") continue;
            secondaryQuantity += toNumber(value);
          }

          if (estimate.kind === "ok") {
            categoryTonnes += estimate.tonnes;
            if (source.biogenic) biogenicTonnes += estimate.tonnes;
          }

          // Scope 2 is captured monthly; lay its cells out by month for the matrix.
          const monthly =
            source.scope === "SCOPE_2"
              ? Array.from({ length: 12 }, (_, i) => {
                  const cell = source.cells.find((c) => c.month === i + 1);
                  return cell?.value ?? "";
                })
              : [];

          const labels = formatEnteredActivity({
            entryMode: source.entryMode,
            value: quantity,
            secondaryValue: secondaryQuantity,
            unit: source.unit,
            // A Scope 3 source is annual, so its routes all hang off the single cell; summing is
            // simply the shape-agnostic way to ask "how many routes does this source have".
            tripCount: source.cells.reduce((n, cell) => n + cell.trips.length, 0),
          });

          return {
            key: source.emissionFactorId || `${source.element}:${source.unit}`,
            element: source.element,
            unit: labels.unit,
            subcategory: source.subcategory,
            factorActive: source.factorActive,
            monthly,
            quantity: labels.value ?? 0,
            hasQuantity,
            secondaryQuantity:
              source.entryMode === "COUNT_TIMES_DISTANCE" ? labels.secondaryValue : null,
            secondaryUnit: labels.secondaryUnit,
            estimate,
          };
        });

        return { category: category.category, sources, tonnes: categoryTonnes };
      });

    // Partition removals out AFTER building: their estimated tonnes are real (and negative),
    // but they belong to their own table, not to this scope's total or the year's.
    const emissionCategories: PreviewCategoryGroup[] = [];
    for (const group of categories) {
      if (group.category.trim() === REMOVALS_CATEGORY) {
        removals = removals
          ? {
              category: removals.category,
              sources: [...removals.sources, ...group.sources],
              tonnes: removals.tonnes + group.tonnes,
            }
          : group;
        continue;
      }
      scopeTonnes += group.tonnes;
      emissionCategories.push(group);
    }

    totalTonnes += scopeTonnes;
    return { scope: scopeVM.scope, categories: emissionCategories, tonnes: scopeTonnes };
  });

  return {
    facilities,
    years,
    filters: baseFilters,
    selectedFacilityName: facilityName,
    gwpSet,
    scopes,
    totalTonnes,
    biogenicTonnes,
    bySede: [],
    removals,
    cleanTech,
    missingGridFactor,
    missingTransportSubsidyPrice,
    isEmpty: false,
    emptyReason: null,
  };
}

// ------------------------------------------------------------------------------------- Company-wide

// A element's display meta, summed across every facility for the year: unit/factor labels (the
// same for every entry sharing an element, since they share one EmissionFactor) plus a summed
// quantity and, for Scope 2, a summed-per-month bucket.
type CompanyElementMeta = {
  unit: string;
  quantity: number;
  secondaryQuantity: number;
  /** How many routes this element carries across every sede. Only the count is used: with routes,
   *  `quantity` already holds the sum of their products, so formatEnteredActivity keeps the
   *  factor's whole unit rather than printing "8.400 ton x 1 km". */
  tripCount: number;
  hasQuantity: boolean;
  factorValue: string | null;
  factorUnit: string | null;
  factorActive: boolean;
  entryMode: EntryMode;
  /** Scope 2 only: one bucket per month (index 0 = January), summed across every facility. */
  monthly: { total: number; hasValue: boolean }[];
};

type ElementIdentity = {
  scope: Scope;
  category: string;
  subcategory: string | null;
  element: string;
};

function elementKey(e: ElementIdentity): string {
  return `${e.scope}::${e.category}::${e.subcategory ?? ""}::${e.element}`;
}

/**
 * The company-wide ("Todas las sedes") counterpart to loadPreview above: the same scope ->
 * category -> source hierarchy the preview tables render, but summed across every facility for
 * the selected year (client feedback 2026-08-15: "a total for the whole company that year").
 *
 * Deliberately NOT built on shapeEntries/estimateSourceTonnes like loadPreview: that helper keys
 * a source's cells by (emissionFactorId, month), and two facilities reporting the SAME month for
 * the SAME Scope 2 factor (the shared "Electricidad de red" element) would collide into two cells
 * both claiming that month, silently dropping one facility's reading from the monthly matrix
 * (estimateSourceTonnes sums every cell regardless of position, so the TOTAL would still be right
 * - only the per-month display would lie, which is worse). Instead this prices the union of every
 * facility's entries through rollupYear directly, via the shared toRollupEntries mapping (see
 * rollup-entries.ts's own comment: the Prisma-row-to-RollupEntry mapping has already been
 * duplicated twice by hand before this helper existed), exactly like load-report.ts's
 * loadCompanyWideReport does for the company-wide export. Quantities and the monthly matrix are
 * a SEPARATE display-only sum straight off the raw entries (floats are fine here, as everywhere
 * else in this preview - nothing is persisted); every t CO2e number comes from rollupYear.
 */
export async function loadCompanyWidePreview(
  companyId: string,
  requested: { year: number | null },
): Promise<PreviewVM> {
  const facilities = await prisma.facility.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const nameByFacility = new Map(facilities.map((f) => [f.id, f.name]));

  // @@unique([facilityId, year]) guarantees at most one reporting year per facility for a given
  // calendar year, so grouping these by `year` below is a true one-row-per-facility union.
  const reportingYears = await prisma.reportingYear.findMany({
    where: { companyId },
    select: { id: true, facilityId: true, year: true, gwpSet: true },
  });
  const years = [...new Set(reportingYears.map((ry) => ry.year))].sort((a, b) => b - a);

  if (years.length === 0) {
    return empty(facilities, { facilityId: null, year: null }, "noYear", years);
  }

  const selectedYear =
    requested.year && years.includes(requested.year) ? requested.year : years[0];
  const yearRows = reportingYears.filter((ry) => ry.year === selectedYear);
  const reportingYearIds = yearRows.map((ry) => ry.id);
  const baseFilters = { facilityId: null, year: selectedYear };
  // Every facility's row for the same calendar year carries the same gwpSet (derived from the
  // year at creation, never a per-facility choice - see load-report.ts's own comment), so any one
  // of them is representative.
  const gwpSet = yearRows[0].gwpSet as GwpSet;

  const [entries, gridFactor, subsidyPrices, cleanTechRows] = await Promise.all([
    prisma.activityEntry.findMany({
      where: { reportingYearId: { in: reportingYearIds }, companyId },
      orderBy: [{ category: "asc" }, { element: "asc" }, { month: "asc" }],
      select: {
        reportingYearId: true,
        scope: true,
        category: true,
        subcategory: true,
        element: true,
        unit: true,
        month: true,
        value: true,
        secondaryValue: true,
        // The routes of a COUNT_TIMES_DISTANCE source: rollupYear sums each row's own product.
        trips: {
          select: { count: true, distanceKm: true },
          orderBy: { position: "asc" },
        },
        emissionFactor: {
          select: {
            active: true,
            biogenic: true,
            co2Factor: true,
            ch4Factor: true,
            n2oFactor: true,
            co2eFactor: true,
            factorUnit: true,
            entryMode: true,
            gasType: true,
            fuelType: true,
          },
        },
      },
    }),
    prisma.gridElectricityFactor.findUnique({
      where: { year: selectedYear },
      select: { factor: true },
    }),
    prisma.transportSubsidyPrice.findMany({
      where: { year: selectedYear },
      select: { fuel: true, pricePerGallonCop: true },
    }),
    prisma.cleanTechEntry.findMany({
      where: { reportingYearId: { in: reportingYearIds }, companyId },
      orderBy: { createdAt: "asc" },
      select: { id: true, scope: true, element: true, quantity: true, unit: true },
    }),
  ]);

  const cleanTech = cleanTechRows.map((row) => ({
    id: row.id,
    scope: row.scope,
    element: row.element,
    quantity: row.quantity === null ? null : row.quantity.toString(),
    unit: row.unit,
  }));

  if (entries.length === 0 && cleanTech.length === 0) {
    return { ...empty(facilities, baseFilters, "noData", years), gwpSet };
  }

  const gridFactorStr = gridFactor ? gridFactor.factor.toString() : null;
  const fuelPrices = toFuelPrices(subsidyPrices);

  const rollup = rollupYear({
    entries: toRollupEntries(entries),
    gridFactor: gridFactorStr,
    fuelPrices,
    gwpSet,
  });

  // Element-level display meta: the same kind of join load-report.ts's buildReportFromEntries
  // does between rollupYear's byElement and the raw entries (unit/factor labels + a summed
  // quantity), with a monthly bucket added so Scope 2 sums correctly across facilities instead
  // of the shapeEntries cell-collision described above.
  const meta = new Map<string, CompanyElementMeta>();
  for (const entry of entries) {
    const key = elementKey(entry);
    let m = meta.get(key);
    if (!m) {
      const factor = entry.emissionFactor;
      // A Scope 2 element's OWN per-kWh factor, when it has one (the RECs element, worth 0).
      const scope2Own =
        entry.scope === "SCOPE_2" ? (factor?.co2eFactor ?? factor?.co2Factor ?? null) : null;
      m = {
        unit: entry.unit,
        quantity: 0,
        secondaryQuantity: 0,
        // How many routes the source carries, across every sede. Only the count matters: with
        // routes, value already holds the sum of their products, so the labels must name the
        // factor's whole unit instead of reading "8.400 ton x 1 km".
        tripCount: 0,
        hasQuantity: false,
        // Scope 2 is priced by the national grid factor UNLESS the element carries its own
        // per-kWh value (the RECs element, worth 0) - the same rule rollupYear's scope2RatePerKwh
        // and buildReportFromEntries apply. Printing the grid factor next to a REC element's zero
        // tonnes would contradict it.
        factorValue:
          entry.scope === "SCOPE_2"
            ? (scope2Own?.toString() ?? gridFactorStr)
            : (factor?.co2eFactor?.toString() ??
              factor?.co2Factor?.toString() ??
              factor?.ch4Factor?.toString() ??
              factor?.n2oFactor?.toString() ??
              null),
        factorUnit:
          entry.scope === "SCOPE_2"
            ? scope2Own !== null
              ? (factor?.factorUnit ?? "kg CO2e/kWh")
              : "kg CO2/kWh"
            : (factor?.factorUnit ?? null),
        factorActive: factor?.active ?? false,
        entryMode: factor?.entryMode ?? "QUANTITY",
        monthly: Array.from({ length: 12 }, () => ({ total: 0, hasValue: false })),
      };
      meta.set(key, m);
    }
    if (entry.value !== null) {
      const qty = toNumber(entry.value.toString());
      m.quantity += qty;
      m.hasQuantity = true;
      if (entry.scope === "SCOPE_2" && entry.month !== null && entry.month >= 1 && entry.month <= 12) {
        const bucket = m.monthly[entry.month - 1];
        bucket.total += qty;
        bucket.hasValue = true;
      }
    }
    if (entry.secondaryValue !== null) {
      m.secondaryQuantity += toNumber(entry.secondaryValue.toString());
    }
    if (entry.trips.length > 0) {
      m.tripCount += entry.trips.length;
    }
  }

  const byElement = new Map(rollup.byElement.map((e) => [elementKey(e), e]));
  const byCategory = new Map(rollup.byCategory.map((c) => [`${c.scope}::${c.category}`, c]));
  const removalsByElement = new Map(rollup.removals.byElement.map((e) => [elementKey(e), e]));

  // Whether/why an element's tonnes could be priced. An element absent from rollupYear's output
  // was excluded there for one of the same three reasons a report row goes missing (see
  // buildReportFromEntries): a missing grid factor, a missing transport-subsidy price, or no
  // readable factor at all.
  function buildEstimate(id: ElementIdentity, m: CompanyElementMeta, isRemoval: boolean): SourceEstimate {
    const key = elementKey(id);
    const element = (isRemoval ? removalsByElement : byElement).get(key);
    if (element) {
      return {
        kind: "ok",
        tonnes: element.tonnes,
        hasValues: m.hasQuantity,
        factorValue: m.factorValue,
        factorUnit: m.factorUnit,
        factorSource: null,
        // The Resumen screen shows one headline factor per element, not the per-gas breakdown
        // the data-entry summary does; there is no per-gas metadata on this path to list.
        gases: [],
      };
    }
    if (id.scope === "SCOPE_2" && rollup.missingGridFactor) return { kind: "missingGridFactor" };
    if (m.entryMode === "MONEY_PER_GALLON" && rollup.missingTransportSubsidyPrice) {
      return { kind: "missingTransportSubsidyPrice" };
    }
    return { kind: "noFactor" };
  }

  // Rebuild the scope -> category -> source hierarchy the tables expect, from the elements that
  // were actually entered somewhere (never from the factor library): the first entry seen for
  // each key stands in for its identity, since every entry sharing a key agrees on it.
  const seenKeys = new Set<string>();
  const identities: ElementIdentity[] = [];
  for (const entry of entries) {
    const key = elementKey(entry);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    identities.push(entry);
  }

  const categoriesByKey = new Map<string, { scope: Scope; category: string; sources: PreviewSourceRow[] }>();
  const removalSources: PreviewSourceRow[] = [];

  for (const id of identities) {
    const key = elementKey(id);
    const m = meta.get(key)!;
    const isRemoval = id.category.trim() === REMOVALS_CATEGORY;
    const estimate = buildEstimate(id, m, isRemoval);

    const monthly =
      id.scope === "SCOPE_2"
        ? m.monthly.map((bucket) => (bucket.hasValue ? String(bucket.total) : ""))
        : [];

    const labels = formatEnteredActivity({
      entryMode: m.entryMode,
      value: m.quantity,
      secondaryValue: m.secondaryQuantity,
      unit: m.unit,
      tripCount: m.tripCount,
    });

    const source: PreviewSourceRow = {
      key,
      element: id.element,
      unit: labels.unit,
      subcategory: id.subcategory,
      factorActive: m.factorActive,
      monthly,
      quantity: labels.value ?? 0,
      hasQuantity: m.hasQuantity,
      secondaryQuantity: m.entryMode === "COUNT_TIMES_DISTANCE" ? labels.secondaryValue : null,
      secondaryUnit: labels.secondaryUnit,
      estimate,
    };

    if (isRemoval) {
      removalSources.push(source);
      continue;
    }

    const catKey = `${id.scope}::${id.category}`;
    let cat = categoriesByKey.get(catKey);
    if (!cat) {
      cat = { scope: id.scope, category: id.category, sources: [] };
      categoriesByKey.set(catKey, cat);
    }
    cat.sources.push(source);
  }

  const SCOPES: Scope[] = ["SCOPE_1", "SCOPE_2", "SCOPE_3"];
  const scopes: PreviewScopeGroup[] = SCOPES.map((scope) => {
    const categories: PreviewCategoryGroup[] = [...categoriesByKey.values()]
      .filter((c) => c.scope === scope)
      .map((c) => ({
        category: c.category,
        tonnes: byCategory.get(`${c.scope}::${c.category}`)?.tonnes ?? 0,
        sources: [...c.sources].sort(
          (a, b) =>
            (a.subcategory ?? "").localeCompare(b.subcategory ?? "", "es") ||
            a.element.localeCompare(b.element, "es"),
        ),
      }));
    return { scope, categories, tonnes: rollup.byScope[scope] };
  });

  const removals: PreviewVM["removals"] =
    removalSources.length > 0
      ? { category: REMOVALS_CATEGORY, sources: removalSources, tonnes: rollup.removals.tonnes }
      : null;

  // Per-sede subtotal: the same rollup, scoped to one facility's own entries, mirroring
  // load-report.ts's own bySede loop.
  const entriesByReportingYear = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = entriesByReportingYear.get(entry.reportingYearId) ?? [];
    list.push(entry);
    entriesByReportingYear.set(entry.reportingYearId, list);
  }
  const bySede: PreviewSedeTotal[] = yearRows
    .map((ry) => {
      const facilityEntries = entriesByReportingYear.get(ry.id) ?? [];
      const facilityRollup = rollupYear({
        entries: toRollupEntries(facilityEntries),
        gridFactor: gridFactorStr,
        fuelPrices,
        gwpSet,
      });
      return {
        facilityId: ry.facilityId,
        facilityName: nameByFacility.get(ry.facilityId) ?? "",
        tonnes: facilityRollup.totalTonnes,
        incomplete: facilityRollup.missingGridFactor || facilityRollup.unpricedCount > 0,
      };
    })
    .sort((a, b) => b.tonnes - a.tonnes);

  return {
    facilities,
    years,
    filters: baseFilters,
    selectedFacilityName: null,
    gwpSet,
    scopes,
    totalTonnes: rollup.totalTonnes,
    biogenicTonnes: rollup.biogenicTonnes,
    bySede,
    removals,
    cleanTech,
    missingGridFactor: rollup.missingGridFactor,
    missingTransportSubsidyPrice: rollup.missingTransportSubsidyPrice,
    isEmpty: false,
    emptyReason: null,
  };
}
