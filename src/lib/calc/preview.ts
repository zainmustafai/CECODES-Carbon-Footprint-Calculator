import type { EntryMode, GwpSet, Scope } from "@/lib/generated/prisma/client";
import { computeCo2eKg } from "@/lib/calc/engine";
import { isFuelCategory } from "@/lib/calc/ch4-rule";
import { gallonsFromMoney, type FuelPrices, type FuelType } from "@/lib/calc/fuel";
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
  /** Which gas a PRE-BLENDED factor is ("HFC", "PFC", "SF6", "NF3"), so the summary can name it
   *  rather than showing an anonymous CO2e number. Null for a per-gas factor. */
  gasType?: string | null;
  /** Only meaningful for MONEY_PER_GALLON: which of the year's average prices to divide by, so a
   *  diesel subsidy is never charged the gasoline price. Null for every other factor. */
  fuelType?: FuelType | null;
};

/** One gas a factor carries, for the data-entry summary. Client feedback 2026-09-03: "when
 *  applicable, show not only CO2 emission factor, include all other gases even SF6, HFC, etc." */
export type FactorGas = { gas: string; value: string; unit: string | null };

export type PreviewGridFactor = { factor: string; source: string | null };
/** Both of the year's average prices per gallon. A fuel with no price for that year stays null,
 *  which is reported as missing rather than substituted with the other fuel's number. */
export type PreviewSubsidyPrice = { prices: FuelPrices; source: string | null };

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
      /**
       * Every gas this factor actually carries, so the user sees the whole factor rather than
       * just its headline number. A per-gas factor lists CO2, CH4 and N2O separately (only those
       * it has); a pre-blended one lists its single CO2e value under the gas it represents.
       */
      gases: FactorGas[];
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
      // Scope 2 is priced from the national grid factor, which is a pure CO2 number.
      gases: [{ gas: "CO2", value: gridFactor.factor, unit: "kg CO2/kWh" }],
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
    // The price of THIS factor's own fuel. An absent, zero or unparseable price is reported as
    // missing rather than divided by: dividing by zero would render Infinity tonnes on screen.
    const gallons = gallonsFromMoney(
      money.total,
      pricePerGallon?.prices ?? null,
      factor?.fuelType ?? null,
    );
    if (gallons === null) return { kind: "missingTransportSubsidyPrice" };
    activity = gallons;
    derivedGallons = activity;
  } else if (entryMode === "COUNT_TIMES_DISTANCE") {
    // Sum each route's PRODUCT, never the product of the sums. The two agree only while a source
    // has exactly one cell, which is why this went unnoticed until the trip table (client
    // feedback 2026-09-03, E3) made N routes possible: 4 x 250 plus 6 x 100 is 1.600 pasajeros
    // por km, not (4 + 6) x (250 + 100) = 3.500.
    let total = 0;
    let sawCount = false;
    let sawDistance = false;
    for (let i = 0; i < values.length; i++) {
      const count = sumActivity([values[i] ?? ""]);
      const distance = sumActivity([secondaryValues[i] ?? ""]);
      if (count.hasValues) sawCount = true;
      if (distance.hasValues) sawDistance = true;
      if (!count.hasValues || !distance.hasValues) continue;
      total += count.total * distance.total;
    }
    // Both halves must have been reported somewhere. A count with no distance anywhere is an
    // unfinished entry, not a zero, which is the rule this mode has applied since it existed.
    hasValues = sawCount && sawDistance;
    activity = total;
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
    gases: listFactorGases(factor),
  };
}

/**
 * The gases a factor carries, in the order the GWP table lists them. A pre-blended factor has
 * exactly one entry, named by the gas the importer captured (or a neutral "CO2e" when it captured
 * none), because its individual gas masses were never retained.
 */
export function listFactorGases(factor: PreviewFactor): FactorGas[] {
  if (factor.co2eFactor !== null) {
    return [
      {
        gas: factor.gasType?.trim() || "CO2e",
        value: factor.co2eFactor,
        unit: factor.factorUnit,
      },
    ];
  }

  const unit = factor.factorUnit;
  // "kg CO2/gal" -> "/gal", so CH4 and N2O can be labelled in their own mass against the same
  // activity unit.
  //
  // Everything from the first slash, rather than a regex that strips a leading "kg <gas>" token:
  // the workbook spells the mass token both ways and the unspaced form is genuine sheet content,
  // not corruption (see map-row.test.ts, cell 16 = "kgCH4/t"). A regex requiring the space left
  // "kgCH4/cabeza" untouched and then prepended to it, printing "kg CH4kgCH4/cabeza" on the
  // estimate panel. The activity unit is what we actually want here, and it always follows the
  // slash whichever way the mass token is spelled.
  const slash = unit?.indexOf("/") ?? -1;
  const perUnit = slash >= 0 ? unit!.slice(slash) : "";
  const gases: FactorGas[] = [];
  if (factor.co2Factor !== null) gases.push({ gas: "CO2", value: factor.co2Factor, unit });
  // CH4 and N2O share the factor's activity unit but are their own gas mass, so the label is
  // rebuilt rather than reusing the CO2 unit verbatim.
  if (factor.ch4Factor !== null)
    gases.push({ gas: "CH4", value: factor.ch4Factor, unit: unit ? `kg CH4${perUnit}` : null });
  if (factor.n2oFactor !== null)
    gases.push({ gas: "N2O", value: factor.n2oFactor, unit: unit ? `kg N2O${perUnit}` : null });
  return gases;
}
