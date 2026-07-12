import type { GwpSet, Scope } from "@/lib/generated/prisma/client";
import { computeCo2eKg, type FactorInput } from "@/lib/calc/engine";
import { isFuelCategory } from "@/lib/calc/ch4-rule";
import { kgToTonnes } from "@/lib/gwp";
import { isValidEntryValue, normalizeDecimalInput } from "@/lib/decimal-input";

// Rolls a reporting year's activity entries up into the totals the dashboard shows: overall,
// per scope, per category, and the Scope 2 monthly trend.
//
// This computes in float64, deliberately. The stored activity data and factors are Prisma
// Decimals and stay Decimals in the database; nothing here is persisted (the dashboard reads
// live and displays). The Excel this tool reproduces is itself a float64 spreadsheet, so
// computing the roll-ups as numbers is what parity actually requires. The engine and GWP math
// live in engine.ts and gwp.ts, both unit tested; this module only sums their output.

export type RollupFactor = {
  co2Factor: string | null;
  ch4Factor: string | null;
  n2oFactor: string | null;
  co2eFactor: string | null;
  biogenic: boolean;
};

export type RollupEntry = {
  scope: Scope;
  category: string;
  month: number | null;
  /** Activity data as a Decimal string, or null when not reported. */
  value: string | null;
  /** null when the factor row was removed (onDelete SetNull); Scope 2 never has one. */
  factor: RollupFactor | null;
};

export type ScopeTotals = Record<Scope, number>;

export type CategoryTotal = { scope: Scope; category: string; tonnes: number };

/** One month of the Scope 2 trend. tonnes is null when no month was reported (a gap, not 0). */
export type MonthlyPoint = { month: number; tonnes: number | null };

export type YearRollup = {
  totalTonnes: number;
  byScope: ScopeTotals;
  /** Per (scope, category), largest first. */
  byCategory: CategoryTotal[];
  /** Twelve entries, Enero to Diciembre. Only Scope 2 is captured monthly. */
  scope2Monthly: MonthlyPoint[];
  /**
   * Total CO2e of the sources FLAGGED BIOGENIC. This includes their CH4 and N2O, so it is NOT
   * "biogenic CO2" and MUST NOT be subtracted from the headline: doing so would remove real,
   * non-biogenic emissions. For the GHG Protocol memo item, use biogenicCo2Tonnes.
   */
  biogenicTonnes: number;
  /**
   * The biogenic CO2 portion only: the memo item the GHG Protocol actually asks for, and the
   * number to subtract if CECODES rules that biogenic CO2 sits outside the headline
   * (Requirements 12.A5). CH4 and N2O from biomass stay in the scopes either way.
   */
  biogenicCo2Tonnes: number;
  /**
   * True when a biogenic source carried only a consolidated CO2e factor, which cannot be split
   * back into its gases. biogenicCo2Tonnes then UNDERSTATES the memo item, and says so rather
   * than guessing a decomposition.
   */
  biogenicCo2Partial: boolean;
  /** The year has no national grid factor, so its Scope 2 emissions could not be computed. */
  missingGridFactor: boolean;
  /**
   * Entries EXCLUDED from every total because they could not be priced: no factor row, a factor
   * with no readable value (e.g. spend-only COP/USD), or Scope 2 with no grid factor. A non-zero
   * count means the totals are INCOMPLETE, not that those sources emit nothing. Anything that
   * publishes a total (an export, a report, a snapshot) must disclose this.
   */
  unpricedCount: number;
};

const SCOPES: Scope[] = ["SCOPE_1", "SCOPE_2", "SCOPE_3"];

// Activity data is a raw Decimal string. Parse defensively: an unreported (null), blank, or
// somehow-invalid value contributes zero rather than NaN-poisoning a whole scope.
function parseActivity(value: string | null): number {
  if (value === null) return 0;
  const normalized = normalizeDecimalInput(value);
  if (normalized === "" || !isValidEntryValue(normalized)) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Whether the engine can actually turn this factor into a number. A factor row can exist and
// still be unpriceable: an admin may fill only co2eFactorCop / co2eFactorUsd (the spend-based
// columns), which FactorInput does not carry, and computeCo2eKg would then dutifully return 0.
// A real emission source silently worth 0 t, in a category that looks complete, is exactly the
// class of bug this tool exists to replace.
function isPriceable(factor: RollupFactor): boolean {
  return (
    factor.co2eFactor !== null ||
    factor.co2Factor !== null ||
    factor.ch4Factor !== null ||
    factor.n2oFactor !== null
  );
}

// `category` is needed only so the engine can answer "is this a fuel", which the "is-a-fuel" CH4
// rule depends on. Under the default rule it is unused but harmless. See lib/calc/ch4-rule.ts.
function toFactorInput(factor: RollupFactor, category: string): FactorInput {
  const num = (value: string | null) => (value === null ? null : Number(value));
  return {
    co2Factor: num(factor.co2Factor),
    ch4Factor: num(factor.ch4Factor),
    n2oFactor: num(factor.n2oFactor),
    co2eFactor: num(factor.co2eFactor),
    biogenic: factor.biogenic,
    isFuel: isFuelCategory(category),
  };
}

export function rollupYear({
  entries,
  gridFactor,
  gwpSet,
}: {
  entries: RollupEntry[];
  /** kg CO2 per kWh for the reporting year, or null when it has not been loaded. */
  gridFactor: string | null;
  gwpSet: GwpSet;
}): YearRollup {
  let unpricedCount = 0;
  let biogenicCo2Tonnes = 0;
  let biogenicCo2Partial = false;

  const byScope: ScopeTotals = { SCOPE_1: 0, SCOPE_2: 0, SCOPE_3: 0 };
  const categories = new Map<string, CategoryTotal>();
  const monthKg = new Array<number>(12).fill(0);
  const monthReported = new Array<boolean>(12).fill(false);
  let biogenicTonnes = 0;
  let missingGridFactor = false;

  const grid = gridFactor !== null ? Number(gridFactor) : null;

  for (const entry of entries) {
    const activity = parseActivity(entry.value);
    const reported = entry.value !== null;

    let kg = 0;
    if (entry.scope === "SCOPE_2") {
      // Scope 2 does not carry a factor on the row. It is the national grid factor for the
      // year, a pure CO2 value in kg CO2/kWh (GWP of CO2 is 1).
      if (grid === null) {
        // A year with no grid factor cannot be priced. This used to fall through and add a
        // real 0 into byScope, byCategory and the monthly series, guarded only by the flag
        // below. Any consumer that forgot to read the flag (an export, a snapshot writer)
        // would then publish a fabricated zero as if it were a measurement. Excluding the
        // entry is the honest answer: the flag says the number is incomplete, and the number
        // itself does not lie.
        missingGridFactor = true;
        unpricedCount += 1;
        continue;
      }
      kg = activity * grid;
    } else if (entry.factor && isPriceable(entry.factor)) {
      kg = computeCo2eKg(activity, toFactorInput(entry.factor, entry.category), gwpSet);
    } else {
      // Either the factor row was removed (onDelete SetNull), or it exists but carries no
      // value the engine can read: the spend-based COP/USD columns are a real example, since
      // an admin can fill only those and FactorInput cannot see them. Both cases are unpriced.
      // Skip rather than count a zero into a category that would then look complete.
      unpricedCount += 1;
      continue;
    }

    const tonnes = kgToTonnes(kg);
    byScope[entry.scope] += tonnes;

    const key = `${entry.scope}::${entry.category}`;
    const existing = categories.get(key);
    if (existing) existing.tonnes += tonnes;
    else categories.set(key, { scope: entry.scope, category: entry.category, tonnes });

    if (
      entry.scope === "SCOPE_2" &&
      entry.month != null &&
      entry.month >= 1 &&
      entry.month <= 12
    ) {
      monthKg[entry.month - 1] += kg;
      if (reported) monthReported[entry.month - 1] = true;
    }

    if (entry.factor?.biogenic) {
      // Two different numbers, and conflating them was a real bug.
      //
      // biogenicTonnes is the source's WHOLE CO2e, CH4 and N2O included. It answers "how much of
      // the footprint comes from biomass".
      //
      // biogenicCo2Tonnes is the CO2 term alone. That is the GHG Protocol memo item, and the only
      // number it would ever be correct to subtract from the headline: methane and N2O from
      // burning biomass stay inside the scopes no matter how 12.A5 is answered. Subtracting the
      // whole CO2e (which is what this used to accumulate) would quietly delete real emissions.
      biogenicTonnes += tonnes;

      if (entry.factor.co2eFactor !== null) {
        // A consolidated CO2e factor cannot be split back into its gases. Say so rather than
        // guess a decomposition: the memo understates, and biogenicCo2Partial admits it.
        biogenicCo2Partial = true;
      } else if (entry.factor.co2Factor !== null) {
        // GWP of CO2 is 1, so the CO2 term is just activity x factor.
        biogenicCo2Tonnes += kgToTonnes(activity * Number(entry.factor.co2Factor));
      }
    }
  }

  const scope2Monthly: MonthlyPoint[] = monthKg.map((kg, index) => ({
    month: index + 1,
    // A month nobody reported is a gap in the trend, not a zero. 0 means "reported nothing".
    tonnes: monthReported[index] ? kgToTonnes(kg) : null,
  }));

  const byCategory = [...categories.values()].sort((a, b) => b.tonnes - a.tonnes);
  const totalTonnes = SCOPES.reduce((sum, scope) => sum + byScope[scope], 0);

  return {
    totalTonnes,
    byScope,
    byCategory,
    scope2Monthly,
    biogenicTonnes,
    biogenicCo2Tonnes,
    biogenicCo2Partial,
    missingGridFactor,
    unpricedCount,
  };
}
