// Whether the 03-Sept-2026 emission-factor correction has actually been applied to the database.
//
// CECODES confirmed the "Emission Factors" sheet of their DASHBOARD workbook as the official
// table. Diffing it against the sheet the library was loaded from shows 213 rows differing,
// overwhelmingly CH4 and N2O: the official sheet applies a division by 1.000 the old one lacks.
// Correcting that moves real totals, some by 100x or more, so the dashboard and the report carry a
// dated notice explaining why a figure differs from a report downloaded earlier.
//
// THE NOTICE MUST NOT APPEAR BEFORE THE CORRECTION HAS RUN. Printing it while the library still
// holds the old values would tell a reader their numbers were corrected when they were not, which
// is worse than saying nothing.
//
// APPLIED on 2026-09-03. What actually ran, and what it found:
//   import-factors            1.705 rows now match the official sheet, 18 held back by the
//                             human-edit guard, 19 Scope 2 rows compared against
//                             grid_electricity_factors (18 already correct, 1 pending a year).
//   reapply-...-correction    7 of those 18 corrected: the urea factor moved from the CO2 column
//                             to the N2O column exactly as the client's own sheet has it, three
//                             refrigerant CO2e values corrected (R-407F, R-413A, R-437A), and
//                             gasType backfilled to HFC on four. 9 were deliberately skipped
//                             because their stored value supersedes the sheet (see below).
//   fix-travel-factors        8 corrected. The official sheet still multiplies a per-mile factor
//                             by 1.609 where it must divide, and an earlier rename had stranded
//                             the previous correction, so the C6 Viajes Terrestres and C7 rows
//                             THE ENTRIES ACTUALLY POINT AT were carrying values overstated by
//                             1.609^2 = 2,588881. This is the change that moved real numbers.
//   repoint-renamed-factors   NOT run, and correctly so: its candidate heuristic produced 195
//                             pairs that are not renames at all, and the activity entries were
//                             already on the current factors (the old duplicates hold zero
//                             entries), so there was nothing to move.
// Verified afterwards: the two "gal" transport-subsidy factors carry no human-edit marker, so
// fix-travel-factors had never wrongly divided them; and the Excel parity suite passes.
//
// To flip it back, or to re-run after a future workbook: run, in this order,
//   bun prisma/import-factors.ts --dry-run --file "docs/sample-data/CEC-PR-F-024 - DASHBOARD (2025) - New (03-Sept-2026).xlsx"
//   bun prisma/import-factors.ts          --file "docs/sample-data/CEC-PR-F-024 - DASHBOARD (2025) - New (03-Sept-2026).xlsx"
//   bun prisma/reapply-2026-09-03-factor-correction.ts --apply --file "<same workbook>"
//   bun prisma/repoint-renamed-factors.ts            (fill PAIRS from the printed candidates first)
//   bun prisma/fix-travel-factors.ts --apply         (the official sheet still carries the
//                                                     overstated per-mile values, so this is
//                                                     re-applied last and is idempotent)
// then set the flag below to true and redeploy.
export const FACTOR_CORRECTION_APPLIED = true;

/** The date the notice states, kept beside the flag so the two cannot drift apart. */
export const FACTOR_CORRECTION_DATE = "2026-09-03";
