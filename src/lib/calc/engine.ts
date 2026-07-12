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
  // Items stored already as CO2e (refrigerants, SF6/NF3, spend/distance-based).
  if (factor.co2eFactor != null) {
    return activity * factor.co2eFactor;
  }

  const gwp = GWP[gwpSet];
  const ch4Gwp = usesNonFossilCh4(factor, ch4Rule) ? gwp.ch4NonFossil : gwp.ch4Fossil;

  const co2 = activity * (factor.co2Factor ?? 0) * gwp.co2;
  const ch4 = activity * (factor.ch4Factor ?? 0) * ch4Gwp;
  const n2o = activity * (factor.n2oFactor ?? 0) * gwp.n2o;

  return co2 + ch4 + n2o;
}
