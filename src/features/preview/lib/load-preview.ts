import { prisma } from "@/lib/prisma";
import { isValidEntryValue, normalizeDecimalInput } from "@/lib/decimal-input";
import { estimateSourceTonnes } from "@/lib/calc/preview";
import type { GwpSet } from "@/lib/generated/prisma/client";
import { shapeEntries, type EntryRow } from "@/features/data-entry/lib/shape-entries";
import type { GroupedFactors } from "@/features/data-entry/lib/types";
import type { PreviewSourceRow, PreviewScopeGroup, PreviewVM } from "./types";

// shapeEntries seeds its category list from the factor library so empty categories still
// render in the data-entry form. The preview only wants what the company actually entered, so
// it is fed an empty library and shapeEntries produces categories from the entries alone.
const NO_LIBRARY: GroupedFactors = { SCOPE_1: [], SCOPE_2: [], SCOPE_3: [] };

// Sums a source's reported activity for display. Floats are fine here and only here: nothing
// in the preview is persisted, and every value is labelled "estimación referencial". The
// Week 3 engine recomputes official totals from the stored Decimal strings.
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
    missingGridFactor: false,
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

  const [entries, gridFactor] = await Promise.all([
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
          },
        },
      },
    }),
    prisma.gridElectricityFactor.findUnique({
      where: { year: selectedYear.year },
      select: { factor: true, source: true },
    }),
  ]);

  const facilityName = facilities.find((f) => f.id === facilityId)?.name ?? null;
  const baseFilters = { facilityId, year: selectedYear.year };

  if (entries.length === 0) {
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
    factorActive: entry.emissionFactor?.active ?? false,
    biogenic: entry.emissionFactor?.biogenic ?? false,
    factor: entry.emissionFactor
      ? {
          co2Factor: entry.emissionFactor.co2Factor?.toString() ?? null,
          ch4Factor: entry.emissionFactor.ch4Factor?.toString() ?? null,
          n2oFactor: entry.emissionFactor.n2oFactor?.toString() ?? null,
          co2eFactor: entry.emissionFactor.co2eFactor?.toString() ?? null,
          biogenic: entry.emissionFactor.biogenic,
          factorUnit: entry.emissionFactor.factorUnit,
          source: entry.emissionFactor.source,
        }
      : null,
  }));

  const gridFactorVM = gridFactor
    ? { factor: gridFactor.factor.toString(), source: gridFactor.source }
    : null;
  const gwpSet = selectedYear.gwpSet as GwpSet;

  const shaped = shapeEntries(entryRows, [], NO_LIBRARY);

  let totalTonnes = 0;
  let biogenicTonnes = 0;
  let missingGridFactor = false;

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
          const estimate = estimateSourceTonnes({
            values,
            scope: source.scope,
            factor: source.factor,
            gridFactor: gridFactorVM,
            gwpSet,
          });

          if (estimate.kind === "missingGridFactor") missingGridFactor = true;

          let quantity = 0;
          let hasQuantity = false;
          for (const value of values) {
            if (value === "") continue;
            quantity += toNumber(value);
            hasQuantity = true;
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

          return {
            key: source.emissionFactorId || `${source.element}:${source.unit}`,
            element: source.element,
            unit: source.unit,
            subcategory: source.subcategory,
            factorActive: source.factorActive,
            monthly,
            quantity,
            hasQuantity,
            estimate,
          };
        });

        scopeTonnes += categoryTonnes;
        return { category: category.category, sources, tonnes: categoryTonnes };
      });

    totalTonnes += scopeTonnes;
    return { scope: scopeVM.scope, categories, tonnes: scopeTonnes };
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
    missingGridFactor,
    isEmpty: false,
    emptyReason: null,
  };
}
