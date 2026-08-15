import type { GwpSet } from "@/lib/generated/prisma/client";

// Global Warming Potential (GWP / PCG) values used to convert gases to CO2e.
//
// Both sets transcribe the "Global Waming Potentials" sheet of CECODES's DASHBOARD workbook
// (2026-07-24) exactly: AR5 lists CH4 fossil 30 / non-fossil 28, AR6 lists 29.8 / 27. AR6 is
// the column every PRINCIPAL formula in that workbook actually multiplies by ("SON LOS MÁS
// ACTUALIZADOS"); AR5 remains only for reporting years that were created while the old
// pre-2022 boundary was in force, whose stored gwpSet pins them for reproducibility.
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
  AR5: { co2: 1, ch4Fossil: 30, ch4NonFossil: 28, n2o: 265, sf6: 23500, nf3: 16100 },
  AR6: { co2: 1, ch4Fossil: 29.8, ch4NonFossil: 27, n2o: 273, sf6: 24300, nf3: 17400 },
};

// Every reporting year uses AR6, regardless of calendar year. This was an open question
// (Req. §12.5: AR5 up to 2021?) until CECODES's DASHBOARD workbook arrived (2026-07-24): its
// calculation formulas reference the AR6 column unconditionally, for any period entered, and
// Requirements §14.1 makes that spreadsheet the acceptance test. Years created before this
// change keep the gwpSet pinned on their row, so nothing already entered is restated.
export function resolveGwpSet(year: number): GwpSet {
  // The parameter stays so call sites keep saying which year they resolved; the answer simply
  // no longer depends on it.
  void year;
  return "AR6";
}

// 1 tonne CO2e = 1000 kg CO2e. Every user-facing total is expressed in tonnes (t CO2e).
export function kgToTonnes(kg: number): number {
  return kg / 1000;
}

// "AR6" alone does not say which body it's from. The client asked for the IPCC report
// reference to be visible everywhere a GWP set is displayed.
export function formatGwpSource(gwpSet: GwpSet): string {
  return `IPCC ${gwpSet}`;
}
