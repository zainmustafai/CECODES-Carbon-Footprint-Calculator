import type { GwpSet, Scope } from "@/lib/generated/prisma/client";
import { computeCo2eKg } from "@/lib/calc/engine";
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
};

export type PreviewGridFactor = { factor: string; source: string | null };

export type SourceEstimate =
  | {
      kind: "ok";
      tonnes: number;
      /** Whether any month/annual cell actually holds a value. */
      hasValues: boolean;
      factorUnit: string | null;
      factorSource: string | null;
    }
  | { kind: "missingGridFactor" }
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
  scope,
  factor,
  gridFactor,
  gwpSet,
}: {
  values: string[];
  scope: Scope;
  /** null when the factor row was deleted and emissionFactorId went SetNull. */
  factor: PreviewFactor | null;
  gridFactor: PreviewGridFactor | null;
  gwpSet: GwpSet;
}): SourceEstimate {
  const { total, hasValues } = sumActivity(values);

  // Scope 2 does not carry its factor on the EmissionFactor row. It is the national grid
  // factor for the reporting year, which an admin may not have loaded yet.
  if (scope === "SCOPE_2") {
    if (!gridFactor) return { kind: "missingGridFactor" };

    const gridValue = toNumber(gridFactor.factor);
    if (gridValue === null) return { kind: "missingGridFactor" };

    return {
      kind: "ok",
      tonnes: kgToTonnes(total * gridValue),
      hasValues,
      factorUnit: "kg CO2/kWh",
      factorSource: gridFactor.source,
    };
  }

  if (!factor) return { kind: "noFactor" };

  const co2 = toNumber(factor.co2Factor);
  const ch4 = toNumber(factor.ch4Factor);
  const n2o = toNumber(factor.n2oFactor);
  const co2e = toNumber(factor.co2eFactor);

  if (co2 === null && ch4 === null && n2o === null && co2e === null) {
    return { kind: "noFactor" };
  }

  const kg = computeCo2eKg(
    total,
    { co2Factor: co2, ch4Factor: ch4, n2oFactor: n2o, co2eFactor: co2e, biogenic: factor.biogenic },
    gwpSet,
  );

  return {
    kind: "ok",
    tonnes: kgToTonnes(kg),
    hasValues,
    factorUnit: factor.factorUnit,
    factorSource: factor.source,
  };
}
