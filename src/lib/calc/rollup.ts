import type { GwpSet, Scope } from "@/lib/generated/prisma/client";
import { computeCo2eKg, type FactorInput } from "@/lib/calc/engine";
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
  /** Memo item: tonnes attributable to biogenic sources (GHG Protocol discloses these). */
  biogenicTonnes: number;
  /** The year has no national grid factor, so its Scope 2 emissions could not be computed. */
  missingGridFactor: boolean;
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

function toFactorInput(factor: RollupFactor): FactorInput {
  const num = (value: string | null) => (value === null ? null : Number(value));
  return {
    co2Factor: num(factor.co2Factor),
    ch4Factor: num(factor.ch4Factor),
    n2oFactor: num(factor.n2oFactor),
    co2eFactor: num(factor.co2eFactor),
    biogenic: factor.biogenic,
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
        missingGridFactor = true;
      } else {
        kg = activity * grid;
      }
    } else if (entry.factor) {
      kg = computeCo2eKg(activity, toFactorInput(entry.factor), gwpSet);
    } else {
      // A Scope 1/3 row whose factor was removed cannot be computed. Skip it rather than
      // silently count zero into a category that would then look complete.
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

    if (entry.factor?.biogenic) biogenicTonnes += tonnes;
  }

  const scope2Monthly: MonthlyPoint[] = monthKg.map((kg, index) => ({
    month: index + 1,
    // A month nobody reported is a gap in the trend, not a zero. 0 means "reported nothing".
    tonnes: monthReported[index] ? kgToTonnes(kg) : null,
  }));

  const byCategory = [...categories.values()].sort((a, b) => b.tonnes - a.tonnes);
  const totalTonnes = SCOPES.reduce((sum, scope) => sum + byScope[scope], 0);

  return { totalTonnes, byScope, byCategory, scope2Monthly, biogenicTonnes, missingGridFactor };
}
