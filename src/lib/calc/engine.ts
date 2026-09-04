import type { GwpSet } from "@/lib/generated/prisma/client";
import { GWP } from "@/lib/gwp";
import { CH4_GWP_RULE, usesNonFossilCh4, type Ch4Rule } from "@/lib/calc/ch4-rule";

// Calculation engine - see "docs/CECODES Carbon Footprint Tool - Requirements.md" §7.
// Emissions = activity data × emission factor, split per gas, converted to CO2e via GWP,
// then rolled up (element → subcategory → category → scope → company total).
//
// This is the CORE per-source step. The full engine (roll-ups, electricity-by-year,
// distance/spend-based Scope 3, unit conversions) is built on top and MUST reproduce
// the Excel's totals (parity - §14).
//
// ON `number` HERE, NEXT TO A RULE THAT SAYS NEVER `number`: rule 8 governs storing and moving a
// quantity, not computing with one. Every value arrives as a Decimal string and is parsed to a
// double at the call site (parseActivity and toFactorInput in rollup.ts, toNumber in preview.ts
// and load-report.ts). That is deliberate. Excel is IEEE-754 double precision, and reproducing
// its totals is the acceptance test, so a Decimal engine would round differently from the
// workbook it has to agree with. What must never happen is the return trip: a double computed
// here is for display, export and comparison, and is converted back to a Decimal before it can
// reach a NUMERIC column. See "Where the Decimal boundary stops" in IMPLEMENTATION.md.

export interface FactorInput {
  co2Factor?: number | null; // kg CO2 / unit
  ch4Factor?: number | null; // kg CH4 / unit
  n2oFactor?: number | null; // kg N2O / unit
  co2eFactor?: number | null; // kg CO2e / unit - already combined (refrigerants, spend/distance-based)
  biogenic?: boolean; // biogénica: the factor library's biogenic column
  // Whether the source is a fuel (combustible). Only consulted under the "is-a-fuel" CH4 rule;
  // derive it with isFuelCategory(category). See ch4-rule.ts for why this exists at all.
  isFuel?: boolean;
}

/**
 * CO2e (in kilograms) for a single activity value, split by gas. The dashboard's "emissions by
 * gas" view reads this instead of re-deriving it, so the split can never drift from the
 * headline total: computeCo2eKg (below) is defined AS the sum of these four fields, not as an
 * independently computed number that happens to usually agree with it.
 */
export interface GasBreakdownKg {
  co2Kg: number;
  /** CO2e kg from CH4, both buckets. Always equals ch4FossilKg + ch4NonFossilKg. */
  ch4Kg: number;
  n2oKg: number;
  /** Consolidated CO2e kg for factors already expressed as CO2e (refrigerants, SF6/NF3,
   *  spend/distance-based). The individual gas mass was never retained for these. */
  otherKg: number;
  /** True exactly when factor.co2eFactor != null - the same condition computeCo2eKg branches on. */
  isPreBlended: boolean;

  // ---------------------------------------------------------------------------------------
  // Gas MASS, in kg, unweighted by GWP.
  //
  // Every field above is CO2e. The client's "Declaración consolidada GEI (ISO 14064-1)" reports
  // CO2, CH4 and N2O as gas MASS and only the pre-blended gases as CO2e, so a table wired to the
  // CO2e fields would be wrong by 29.8x and 273x while its CO2e total still reconciled perfectly.
  // These fields exist so that mistake cannot be made silently: the declaration reads only the
  // *MassKg fields, and every other surface keeps reading the CO2e ones.
  //
  // Zero for a pre-blended factor: its per-gas mass was never retained by the factor library.
  // ---------------------------------------------------------------------------------------
  co2MassKg: number;
  n2oMassKg: number;
  /** CH4 mass priced at the FOSSIL GWP. Zero when the source is biogenic. */
  ch4FossilMassKg: number;
  /** CH4 mass priced at the NON-FOSSIL GWP. Zero when the source is not biogenic. */
  ch4NonFossilMassKg: number;
  /** ch4Kg, split by which GWP was applied. Exactly one of the two is ever non-zero for a
   *  single source; both are non-zero only in an aggregate that summed sources of both kinds. */
  ch4FossilKg: number;
  ch4NonFossilKg: number;
}

export function computeCo2eBreakdownKg(
  activity: number,
  factor: FactorInput,
  gwpSet: GwpSet,
  ch4Rule: Ch4Rule = CH4_GWP_RULE,
): GasBreakdownKg {
  // Items stored already as CO2e (refrigerants, SF6/NF3, spend/distance-based).
  if (factor.co2eFactor != null) {
    return {
      co2Kg: 0,
      ch4Kg: 0,
      n2oKg: 0,
      otherKg: activity * factor.co2eFactor,
      isPreBlended: true,
      co2MassKg: 0,
      n2oMassKg: 0,
      ch4FossilMassKg: 0,
      ch4NonFossilMassKg: 0,
      ch4FossilKg: 0,
      ch4NonFossilKg: 0,
    };
  }

  const gwp = GWP[gwpSet];
  const nonFossil = usesNonFossilCh4(factor, ch4Rule);
  const ch4Gwp = nonFossil ? gwp.ch4NonFossil : gwp.ch4Fossil;

  const co2MassKg = activity * (factor.co2Factor ?? 0);
  const ch4MassKg = activity * (factor.ch4Factor ?? 0);
  const n2oMassKg = activity * (factor.n2oFactor ?? 0);
  const ch4Kg = ch4MassKg * ch4Gwp;

  return {
    co2Kg: co2MassKg * gwp.co2,
    ch4Kg,
    n2oKg: n2oMassKg * gwp.n2o,
    otherKg: 0,
    isPreBlended: false,
    co2MassKg,
    n2oMassKg,
    // A single source is entirely fossil or entirely non-fossil; the zero on the other side is
    // what lets an aggregate simply add both fields without consulting the biogenic flag again.
    ch4FossilMassKg: nonFossil ? 0 : ch4MassKg,
    ch4NonFossilMassKg: nonFossil ? ch4MassKg : 0,
    ch4FossilKg: nonFossil ? 0 : ch4Kg,
    ch4NonFossilKg: nonFossil ? ch4Kg : 0,
  };
}

/**
 * CO2e (in kilograms) for a single activity value.
 * Convert to tonnes for anything user-facing (see `kgToTonnes` in lib/gwp.ts).
 *
 * `ch4Rule` selects which CH4 GWP applies; it defaults to the rule in force. Pass it explicitly
 * only to compare rules (the parity harness does exactly that). See ch4-rule.ts.
 */
export function computeCo2eKg(
  activity: number,
  factor: FactorInput,
  gwpSet: GwpSet,
  ch4Rule: Ch4Rule = CH4_GWP_RULE,
): number {
  const b = computeCo2eBreakdownKg(activity, factor, gwpSet, ch4Rule);
  return b.co2Kg + b.ch4Kg + b.n2oKg + b.otherKg;
}
