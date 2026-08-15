import type { EntryMode, GwpSet, Scope } from "@/lib/generated/prisma/client";
import { computeCo2eKg } from "@/lib/calc/engine";
import { isFuelCategory } from "@/lib/calc/ch4-rule";
import { kgToTonnes } from "@/lib/gwp";
import { isValidEntryValue, normalizeDecimalInput } from "@/lib/decimal-input";

// A DISPLAY-ONLY estimate of one source's emissions, shown beside the value fields while the
// user types ("Resumen del elemento").
//
// Floats are acceptable HERE and nowhere else in this codebase. Nothing computed here is
// ever persisted: the Week 3 engine recomputes every total from the stored Decimal strings.
// The stored value pipeline (input -> string -> Prisma Decimal) is untouched.
//
// It never reports a silent zero. A missing grid factor or a missing emission factor returns
// an explicit state, because "0.0 t CO2e" for an unpriced source is exactly the class of bug
// this tool exists to replace.

export type PreviewFactor = {
  co2Factor: string | null;
  ch4Factor: string | null;
  n2oFactor: string | null;
  co2eFactor: string | null;
  biogenic: boolean;
  factorUnit: string | null;
  source: string | null;
  /** How the activity quantity is derived - client feedback 2026-08-15. */
  entryMode: EntryMode;
};

export type PreviewGridFactor = { factor: string; source: string | null };
export type PreviewSubsidyPrice = { pricePerGallonCop: string; source: string | null };

export type SourceEstimate =
  | {
      kind: "ok";
      tonnes: number;
      /** Whether any month/annual cell actually holds a value. */
      hasValues: boolean;
      /**
       * The primary factor value as a Decimal string (grid factor for Scope 2, the
       * consolidated CO2e or the CO2 term otherwise). A unit label alone ("kg CO2/gal")
       * tells the user nothing; the number is what makes the estimate auditable.
       */
      factorValue: string | null;
      factorUnit: string | null;
      factorSource: string | null;
      /** Set only for MONEY_PER_GALLON: the gallons derived from the reported money, shown as
       *  an intermediate step so the estimate stays auditable. */
      derivedGallons?: number;
    }
  | { kind: "missingGridFactor" }
  | { kind: "missingTransportSubsidyPrice" }
  | { kind: "noFactor" };

/** Sums the valid cells. Blank and half-typed cells contribute nothing. */
function sumActivity(values: string[]): { total: number; hasValues: boolean } {
  let total = 0;
  let hasValues = false;

  for (const raw of values) {
    // The entry store holds raw keyboard input, so a Colombian "1240,5" is normal here.
    // Number("1240,5") is NaN, which would silently poison the sum.
    const normalized = normalizeDecimalInput(raw);
    if (normalized === "" || !isValidEntryValue(normalized)) continue;

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) continue;

    total += parsed;
    hasValues = true;
  }

  return { total, hasValues };
}

function toNumber(value: string | null): number | null {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function estimateSourceTonnes({
  values,
  secondaryValues = [],
  scope,
  category,
  factor,
  gridFactor,
  pricePerGallon,
  gwpSet,
}: {
  values: string[];
  /** Only meaningful for a COUNT_TIMES_DISTANCE source (client feedback 2026-08-15): the
   *  distance-in-km half of each cell, same indexing as `values`. Always a single element in
   *  practice, since these entry modes only exist on Scope 3's annual, single-cell sources. */
  secondaryValues?: string[];
  scope: Scope;
  /**
   * The source's category. Only used to answer "is this a fuel" for the "is-a-fuel" CH4 rule, so
   * that this preview and rollupYear cannot disagree about the same source. See ch4-rule.ts.
   */
  category?: string | null;
  /** null when the factor row was deleted and emissionFactorId went SetNull. */
  factor: PreviewFactor | null;
  gridFactor: PreviewGridFactor | null;
  /** Only consulted for a MONEY_PER_GALLON source. */
  pricePerGallon: PreviewSubsidyPrice | null;
  gwpSet: GwpSet;
}): SourceEstimate {
  const entryMode: EntryMode = factor?.entryMode ?? "QUANTITY";

  // Scope 2 does not carry its factor on the EmissionFactor row. It is the national grid
  // factor for the reporting year, which an admin may not have loaded yet. Scope 2 is always
  // QUANTITY (a pure kWh reading), so the money/distance derivations below never apply to it.
  if (scope === "SCOPE_2") {
    const { total, hasValues } = sumActivity(values);
    if (!gridFactor) return { kind: "missingGridFactor" };

    const gridValue = toNumber(gridFactor.factor);
    if (gridValue === null) return { kind: "missingGridFactor" };

    return {
      kind: "ok",
      tonnes: kgToTonnes(total * gridValue),
      hasValues,
      factorValue: gridFactor.factor,
      factorUnit: "kg CO2/kWh",
      factorSource: gridFactor.source,
    };
  }

  if (!factor) return { kind: "noFactor" };

  let activity: number;
  let hasValues: boolean;
  let derivedGallons: number | undefined;

  if (entryMode === "MONEY_PER_GALLON") {
    const money = sumActivity(values);
    hasValues = money.hasValues;
    const price = toNumber(pricePerGallon?.pricePerGallonCop ?? null);
    if (price === null) return { kind: "missingTransportSubsidyPrice" };
    activity = money.total / price;
    derivedGallons = activity;
  } else if (entryMode === "COUNT_TIMES_DISTANCE") {
    const count = sumActivity(values);
    const distance = sumActivity(secondaryValues);
    hasValues = count.hasValues && distance.hasValues;
    activity = count.total * distance.total;
  } else {
    const quantity = sumActivity(values);
    hasValues = quantity.hasValues;
    activity = quantity.total;
  }

  const co2 = toNumber(factor.co2Factor);
  const ch4 = toNumber(factor.ch4Factor);
  const n2o = toNumber(factor.n2oFactor);
  const co2e = toNumber(factor.co2eFactor);

  if (co2 === null && ch4 === null && n2o === null && co2e === null) {
    return { kind: "noFactor" };
  }

  const kg = computeCo2eKg(
    activity,
    {
      co2Factor: co2,
      ch4Factor: ch4,
      n2oFactor: n2o,
      co2eFactor: co2e,
      biogenic: factor.biogenic,
      isFuel: isFuelCategory(category),
    },
    gwpSet,
  );

  return {
    kind: "ok",
    ...(derivedGallons !== undefined ? { derivedGallons } : {}),
    tonnes: kgToTonnes(kg),
    hasValues,
    // The consolidated CO2e wins when present, mirroring computeCo2eKg; otherwise the CO2
    // term is the primary number (CH4/N2O ride along in the computed tonnes).
    factorValue: factor.co2eFactor ?? factor.co2Factor ?? factor.ch4Factor ?? factor.n2oFactor,
    factorUnit: factor.factorUnit,
    factorSource: factor.source,
  };
}
