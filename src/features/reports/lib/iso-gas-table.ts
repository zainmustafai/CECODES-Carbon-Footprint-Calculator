import { OTHER_GAS_FALLBACK } from "@/lib/calc/rollup";
import type { CategoryRow } from "./types";

// The "Declaracion consolidada GEI (ISO 14064-1)" table: a by-gas view of the SAME totals
// byCategory already carries (client feedback 2026-08-15: "include a summary table by gas -
// CO2, CH4, N2O, SF6, NF3, etc."). No new calculation happens here - rollupYear already split
// every category's tonnes into co2Tonnes/ch4Tonnes/n2oTonnes/otherGasesByType (see rollup.ts's
// CategoryTotal, whose comment guarantees `tonnes = co2 + ch4 + n2o + otherGases` by
// construction), so summing those four fields across every category reconciles to the report's
// totalTonnes by the same construction, for a single-facility or a company-wide report alike.

export type IsoGasRow = { gas: string; tonnes: number };

/**
 * CO2, CH4 and N2O always appear, even at 0: they are the table's fixed rows. Every named gas a
 * pre-blended factor was captured as (SF6, NF3, HFC-134a, ...) follows, largest first, and a
 * final fallback row catches anything priced with no gas identified at all - never silently
 * dropped, exactly like OTHER_GAS_FALLBACK's own doc comment requires of every other consumer.
 */
export function buildIsoGasTable(byCategory: CategoryRow[]): IsoGasRow[] {
  let co2 = 0;
  let ch4 = 0;
  let n2o = 0;
  const otherByType = new Map<string, number>();

  for (const category of byCategory) {
    co2 += category.co2Tonnes ?? 0;
    ch4 += category.ch4Tonnes ?? 0;
    n2o += category.n2oTonnes ?? 0;
    for (const [gas, tonnes] of Object.entries(category.otherGasesByType ?? {})) {
      otherByType.set(gas, (otherByType.get(gas) ?? 0) + tonnes);
    }
  }

  const rows: IsoGasRow[] = [
    { gas: "CO2", tonnes: co2 },
    { gas: "CH4", tonnes: ch4 },
    { gas: "N2O", tonnes: n2o },
  ];

  const named = [...otherByType.entries()]
    .filter(([gas]) => gas !== OTHER_GAS_FALLBACK)
    .sort((a, b) => b[1] - a[1]);
  for (const [gas, tonnes] of named) rows.push({ gas, tonnes });

  const fallback = otherByType.get(OTHER_GAS_FALLBACK);
  if (fallback) rows.push({ gas: OTHER_GAS_FALLBACK, tonnes: fallback });

  return rows;
}
