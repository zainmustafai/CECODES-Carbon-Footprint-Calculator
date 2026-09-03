import type { EntryMode, FuelType } from "@/lib/generated/prisma/client";
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
  /** One row per route for a COUNT_TIMES_DISTANCE source (client feedback 2026-09-03, E3).
   *  Optional for the same reason gasType is: a caller that does not select the relation is not
   *  forced to, and an absent list falls back to value x secondaryValue. */
  trips?: { count: Decimalish; distanceKm: Decimalish }[];
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
    /** Which fuel a MONEY_PER_GALLON factor buys (client feedback 2026-09-03, E4), so the engine
     *  divides by that fuel's own yearly price. Optional on the same terms as gasType, but note
     *  that a caller which omits it turns every transport subsidy into a missing-price report:
     *  select it wherever Scope 3 C6 can appear. */
    fuelType?: FuelType | null;
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
    trips: row.trips?.map((trip) => ({
      count: trip.count.toString(),
      distanceKm: trip.distanceKm.toString(),
    })),
    factor: row.emissionFactor
      ? {
          co2Factor: row.emissionFactor.co2Factor?.toString() ?? null,
          ch4Factor: row.emissionFactor.ch4Factor?.toString() ?? null,
          n2oFactor: row.emissionFactor.n2oFactor?.toString() ?? null,
          co2eFactor: row.emissionFactor.co2eFactor?.toString() ?? null,
          biogenic: row.emissionFactor.biogenic,
          entryMode: row.emissionFactor.entryMode,
          gasType: row.emissionFactor.gasType ?? null,
          fuelType: row.emissionFactor.fuelType ?? null,
        }
      : null,
  }));
}
