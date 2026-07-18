// WHICH CH4 GWP APPLIES: the open question in Requirements 12.A1, made switchable.
//
// STATUS 2026-07-17: CECODES answered "is-a-fuel". DO NOT FLIP THE CONSTANT YET. Their answer
// names a rule the data cannot execute: there is no "is a fuel" column in the factor library, so
// isFuel is inferred from FUEL_CATEGORIES below, which is OUR GUESS and not their instruction.
// Flipping the switch would promote that guess to load-bearing and silently reclassify, against
// live database counts taken 2026-07-17:
//     Emisiones Fugitivas                    222 rows   29.8 -> 27
//     C5: Residuos generados en operaciones   55 rows   29.8 -> 27
//     Procesos industriales / Uso de suelo     11 rows   29.8 -> 27
//     biogenic fuels in Fuentes Fijas/Moviles           27 -> 29.8
// FUEL_CATEGORIES covers 85 of the 389 CH4-bearing rows; the other 304 are decided by a default.
// Blocked on round-2 item 3 (docs/CLIENT_DECISION_MEMO_ROUND2.md): CECODES must mark which
// categories are combustibles, and say whether "combustible" is a property of the CATEGORY or of
// the ELEMENT. If it is element-level, this file is the wrong shape and the library needs a real
// fuel column, a migration, and an import path.
//
// IPCC gives methane two GWPs: fossil (AR6: 29.8) and non-fossil (AR6: 27). The question is what
// selects between them, and the two candidate answers disagree on roughly 180 rows of the factor
// library, in BOTH directions.
//
//   "biogenic-flag" (our default, and what the tool has always done)
//       The factor library's biogenic column (column 8 of "Jerarquia nueva (2025)") decides.
//       Biogenic source  -> non-fossil (27). Everything else -> fossil (29.8).
//       This matches IPCC's own framing, where the distinction is the ORIGIN of the carbon.
//
//   "is-a-fuel"
//       The Excel's GWP sheet (Hoja2) glosses its two CH4 values as:
//           CH4 FOSIL     "SÓLO COMBUSTIBLES"        29.8
//           CH4 NO FOSIL  "LO QUE NO ES COMBUSTIBLE" 27
//       Read literally, that selects on whether the source is a FUEL, not on its origin.
//       Fuel -> fossil (29.8). Everything else -> non-fossil (27).
//
// They disagree on:
//   - biogenic FUELS (bagazo, biodiesel: 17 Fuentes Fijas + 3 Fuentes Moviles rows).
//     We say 27; a literal reading of the Excel says 29.8.
//   - non-biogenic NON-FUELS (fugitive leaks, industrial processes, land use: 115 + 45 + 15 rows).
//     We say 29.8; a literal reading of the Excel says 27.
//
// We cannot settle this from the workbook we have, because it contains no calculation formulas.
// The parity harness can run a fixture under EITHER rule, so when a real client workbook arrives
// (memo item 0, still outstanding) we can simply see which rule reproduces their totals. That
// remains a better answer than either an opinion or a stated intent: CECODES telling us which rule
// they MEANT to use is not evidence of which rule their spreadsheet EXECUTED, and Requirements
// §14.1 makes the spreadsheet the acceptance test.

export type Ch4Rule = "biogenic-flag" | "is-a-fuel";

/**
 * The rule in force.
 *
 * Still "biogenic-flag" DESPITE CECODES answering "is-a-fuel" on 2026-07-17. See the STATUS note at
 * the top of this file: their answer is not yet executable, and flipping this line would reclassify
 * 277 rows of their library on our guess at what "combustible" means. Flip it only once round-2
 * item 3 returns the marked category list, and update FUEL_CATEGORIES in the same change.
 */
export const CH4_GWP_RULE: Ch4Rule = "biogenic-flag";

// The combustion categories in CECODES's own hierarchy. "Combustible" in the Excel's sense means
// a fuel that is burned, which in this library is exactly stationary and mobile combustion.
//
// Deliberately NOT a fuzzy match on the element name: "Diesel" appears in Scope 3 transport rows
// too, and whether those count as "combustibles" to CECODES is precisely the ambiguity we are
// asking about. Keying on the category keeps the guess in one visible place.
const FUEL_CATEGORIES = new Set(["Fuentes Fijas", "Fuentes Móviles"]);

export function isFuelCategory(category: string | null | undefined): boolean {
  return category != null && FUEL_CATEGORIES.has(category.trim());
}

/**
 * Whether a source takes the NON-FOSSIL CH4 GWP (27 under AR6) rather than the fossil one (29.8).
 * The single place the two candidate rules diverge.
 */
export function usesNonFossilCh4(
  source: { biogenic?: boolean | null; isFuel?: boolean | null },
  rule: Ch4Rule = CH4_GWP_RULE,
): boolean {
  if (rule === "is-a-fuel") {
    // Everything that is NOT a fuel takes the non-fossil value.
    return !(source.isFuel ?? false);
  }
  return source.biogenic ?? false;
}
