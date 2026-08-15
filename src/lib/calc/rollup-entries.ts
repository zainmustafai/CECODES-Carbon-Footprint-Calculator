import type { EntryMode } from "@/lib/generated/prisma/client";
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
  secondaryValue: Decimalish | null;
  emissionFactor: {
    co2Factor: Decimalish | null;
    ch4Factor: Decimalish | null;
    n2oFactor: Decimalish | null;
    co2eFactor: Decimalish | null;
    biogenic: boolean;
    entryMode: EntryMode;
    /** Which gas a pre-blended factor is (client feedback 2026-08-15) - see rollup.ts's
     *  RollupFactor.gasType. Optional so a caller that does not need the gas-by-type breakdown
     *  (the report loader) is not forced to select this column; absent behaves as null. */
    gasType?: string | null;
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
    secondaryValue: row.secondaryValue === null ? null : row.secondaryValue.toString(),
    factor: row.emissionFactor
      ? {
          co2Factor: row.emissionFactor.co2Factor?.toString() ?? null,
          ch4Factor: row.emissionFactor.ch4Factor?.toString() ?? null,
          n2oFactor: row.emissionFactor.n2oFactor?.toString() ?? null,
          co2eFactor: row.emissionFactor.co2eFactor?.toString() ?? null,
          biogenic: row.emissionFactor.biogenic,
          entryMode: row.emissionFactor.entryMode,
          gasType: row.emissionFactor.gasType ?? null,
        }
      : null,
  }));
}
