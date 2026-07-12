import { prisma } from "@/lib/prisma";
import { rollupYear, type RollupEntry } from "@/lib/calc/rollup";
import { isValidEntryValue, normalizeDecimalInput } from "@/lib/decimal-input";
import type { GwpSet } from "@/lib/generated/prisma/client";
import type { ActivityRow, ReportVM, ResultRow } from "./types";

// Builds the export for one facility and reporting year.
//
// EVERY computed number here comes out of rollupYear, the same function that feeds the dashboard.
// Nothing in this file multiplies an activity by a factor. That is deliberate and it is the whole
// point: this file produces the artifact CECODES will diff against their spreadsheet, so if it did
// its own arithmetic, any shortcut in it would read to them as a calculation bug in the product.
// The raw entries are used only for the as-entered activity sheet and for element metadata.

/** Sums an element's reported activity for the quantity column. Display-only, like the roll-up. */
function toNumber(value: string | null): number {
  if (value === null) return 0;
  const normalized = normalizeDecimalInput(value);
  if (normalized === "" || !isValidEntryValue(normalized)) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function loadReport(
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

  const [entries, grid] = await Promise.all([
    prisma.activityEntry.findMany({
      where: { reportingYearId: reportingYear.id, companyId },
      orderBy: [
        { scope: "asc" },
        { category: "asc" },
        { subcategory: "asc" },
        { element: "asc" },
        { month: "asc" },
      ],
      select: {
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
          },
        },
      },
    }),
    prisma.gridElectricityFactor.findUnique({
      where: { year: reportingYear.year },
      select: { factor: true },
    }),
  ]);

  const gridFactor = grid ? grid.factor.toString() : null;
  const gwpSet = reportingYear.gwpSet as GwpSet;

  // Decimals cross as strings and stay strings until the engine, exactly as everywhere else.
  const rollupEntries: RollupEntry[] = entries.map((entry) => ({
    scope: entry.scope,
    category: entry.category,
    subcategory: entry.subcategory,
    element: entry.element,
    month: entry.month,
    value: entry.value === null ? null : entry.value.toString(),
    factor: entry.emissionFactor
      ? {
          co2Factor: entry.emissionFactor.co2Factor?.toString() ?? null,
          ch4Factor: entry.emissionFactor.ch4Factor?.toString() ?? null,
          n2oFactor: entry.emissionFactor.n2oFactor?.toString() ?? null,
          co2eFactor: entry.emissionFactor.co2eFactor?.toString() ?? null,
          biogenic: entry.emissionFactor.biogenic,
        }
      : null,
  }));

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
    { unit: string; factorValue: string | null; factorUnit: string | null; quantity: number }
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
    });
  }

  // The results sheet IS rollupYear's element roll-up. An element that the engine excluded (no
  // factor, unreadable factor, no grid factor) is absent here too, rather than showing a zero:
  // the disclosures below say how many were dropped.
  const results: ResultRow[] = rollup.byElement.map((element) => {
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
    };
  });

  return {
    companyName: company.name,
    facilityName: facility.name,
    year: reportingYear.year,
    gwpSet,
    gridFactor,

    activity,
    results,
    byScope: (["SCOPE_1", "SCOPE_2", "SCOPE_3"] as const).map((scope) => ({
      scope,
      tonnes: rollup.byScope[scope],
    })),
    byCategory: rollup.byCategory,
    totalTonnes: rollup.totalTonnes,

    biogenicTonnes: rollup.biogenicTonnes,
    biogenicCo2Tonnes: rollup.biogenicCo2Tonnes,
    biogenicCo2Partial: rollup.biogenicCo2Partial,
    missingGridFactor: rollup.missingGridFactor,
    unpricedCount: rollup.unpricedCount,

    generatedAt: new Date(),
  };
}
