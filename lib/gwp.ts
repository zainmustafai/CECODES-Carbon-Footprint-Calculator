import type { GwpSet } from "@/lib/generated/prisma/client";

// Global Warming Potential (GWP / PCG) values used to convert gases to CO2e.
// AR6 values per IPCC AR6; AR5 kept for reporting years up to and including 2021.
// The 2021 boundary and biogenic-CO2 treatment are pending CECODES confirmation (Req. §12.5).
export const GWP: Record<
  GwpSet,
  {
    co2: number;
    ch4Fossil: number;
    ch4NonFossil: number;
    n2o: number;
    sf6: number;
    nf3: number;
  }
> = {
  AR5: { co2: 1, ch4Fossil: 28, ch4NonFossil: 28, n2o: 265, sf6: 23500, nf3: 16100 },
  AR6: { co2: 1, ch4Fossil: 29.8, ch4NonFossil: 27, n2o: 273, sf6: 24300, nf3: 17400 },
};

// Reporting years up to and including 2021 use AR5; later years use AR6.
export function resolveGwpSet(year: number): GwpSet {
  return year <= 2021 ? "AR5" : "AR6";
}

// 1 tonne CO2e = 1000 kg CO2e. Every user-facing total is expressed in tonnes (t CO2e).
export function kgToTonnes(kg: number): number {
  return kg / 1000;
}
