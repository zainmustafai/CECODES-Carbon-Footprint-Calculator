// WHICH CH4 GWP APPLIES: the open question in Requirements 12.A5, made switchable.
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
// It is item 1 of docs/CLIENT_DECISION_MEMO.md. Until CECODES answers, the default stays as it
// was, and the parity harness can run a fixture under EITHER rule, so when a real client workbook
// arrives we can simply see which rule reproduces their totals. That is a better answer than an
// opinion.

export type Ch4Rule = "biogenic-flag" | "is-a-fuel";

/** The rule in force. Change this line when CECODES answers memo item 1. */
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
