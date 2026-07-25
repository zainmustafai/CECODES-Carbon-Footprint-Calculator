// WHICH CH4 GWP APPLIES: the open question in Requirements 12.A1, made switchable.
//
// STATUS 2026-07-24: RESOLVED, EMPIRICALLY, in favour of "biogenic-flag" (the constant below is
// therefore correct and must not flip). CECODES's DASHBOARD workbook arrived with calculation
// formulas in it, and they EXECUTE the biogenic-flag rule verbatim: every PRINCIPAL row computes
//     kg CH4 (no fósil) = IF(VLOOKUP(element, factors, 5) = 1, qty * FE_CH4, 0)   -> x 27
//     kg CH4 (fósil)    = IF(VLOOKUP(element, factors, 5) = 0, qty * FE_CH4, 0)   -> x 29.8
// where lookup column 5 is exactly the library's "0=No biogénica / 1=biogénica" column, and the
// workbook's GWP sheet labels the two CH4 rows "Biogénico 1" and "No biogénico 0". The 2026-07-17
// verbal answer "is-a-fuel" is what they SAID; the biogenic flag is what their spreadsheet DOES,
// and Requirements §14.1 makes the spreadsheet the acceptance test. The client-origin parity
// fixture (fixtures/parity/cecodes-dashboard-principal-2024.json) reproduces their cached totals
// under this rule. Round-2 item 3 (the "mark which categories are fuels" list) is moot: no list is
// needed, the flag already exists per element in their own file.
//
// The historical context, kept because the "is-a-fuel" machinery below still exists for the
// parity harness to compare rules:
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
 * The rule in force: "biogenic-flag", CONFIRMED 2026-07-24 by the client's own workbook formulas
 * (see the STATUS note at the top of this file). Do not flip this without new, formula-level
 * evidence from CECODES; a verbal preference is not that evidence, as this file's history shows.
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
