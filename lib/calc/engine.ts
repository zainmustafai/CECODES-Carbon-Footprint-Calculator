import type { GwpSet } from "@/lib/generated/prisma/client";
import { GWP } from "@/lib/gwp";

// Calculation engine — see "docs/CECODES Carbon Footprint Tool - Requirements.md" §7.
// Emissions = activity data × emission factor, split per gas, converted to CO2e via GWP,
// then rolled up (element → subcategory → category → scope → company total).
//
// This is the CORE per-source step. The full engine (roll-ups, electricity-by-year,
// distance/spend-based Scope 3, unit conversions) is built on top and MUST reproduce
// the Excel's totals (parity — §14).

export interface FactorInput {
  co2Factor?: number | null; // kg CO2 / unit
  ch4Factor?: number | null; // kg CH4 / unit
  n2oFactor?: number | null; // kg N2O / unit
  co2eFactor?: number | null; // kg CO2e / unit — already combined (refrigerants, spend/distance-based)
  biogenic?: boolean; // biogénica: selects the non-fossil CH4 GWP
}

/**
 * CO2e (in kilograms) for a single activity value.
 * Convert to tonnes for anything user-facing (see `kgToTonnes` in lib/gwp.ts).
 */
export function computeCo2eKg(
  activity: number,
  factor: FactorInput,
  gwpSet: GwpSet,
): number {
  // Items stored already as CO2e (refrigerants, SF6/NF3, spend/distance-based).
  if (factor.co2eFactor != null) {
    return activity * factor.co2eFactor;
  }

  const gwp = GWP[gwpSet];
  const ch4Gwp = factor.biogenic ? gwp.ch4NonFossil : gwp.ch4Fossil;

  const co2 = activity * (factor.co2Factor ?? 0) * gwp.co2;
  const ch4 = activity * (factor.ch4Factor ?? 0) * ch4Gwp;
  const n2o = activity * (factor.n2oFactor ?? 0) * gwp.n2o;

  return co2 + ch4 + n2o;
}
