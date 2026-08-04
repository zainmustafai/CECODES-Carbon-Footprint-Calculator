import type { RollupEntry } from "./rollup";

// The Prisma-row-to-RollupEntry mapping, shared by every caller that hands raw activityEntry
// rows to rollupYear. It used to be copied verbatim in load-report.ts and dashboard-data.ts (and
// was about to become a third copy) - one shared function so they cannot silently disagree.
type Decimalish = { toString(): string };

export type RollupSourceRow = {
  scope: RollupEntry["scope"];
  category: string;
  subcategory: string | null;
  element: string;
  month: number | null;
  value: Decimalish | null;
  emissionFactor: {
    co2Factor: Decimalish | null;
    ch4Factor: Decimalish | null;
    n2oFactor: Decimalish | null;
    co2eFactor: Decimalish | null;
    biogenic: boolean;
  } | null;
};

export function toRollupEntries(rows: RollupSourceRow[]): RollupEntry[] {
  return rows.map((row) => ({
    scope: row.scope,
    category: row.category,
    subcategory: row.subcategory,
    element: row.element,
    month: row.month,
    value: row.value === null ? null : row.value.toString(),
    factor: row.emissionFactor
      ? {
          co2Factor: row.emissionFactor.co2Factor?.toString() ?? null,
          ch4Factor: row.emissionFactor.ch4Factor?.toString() ?? null,
          n2oFactor: row.emissionFactor.n2oFactor?.toString() ?? null,
          co2eFactor: row.emissionFactor.co2eFactor?.toString() ?? null,
          biogenic: row.emissionFactor.biogenic,
        }
      : null,
  }));
}
