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
// To flip it: run, in this order,
//   bun prisma/import-factors.ts --dry-run --file "docs/sample-data/CEC-PR-F-024 - DASHBOARD (2025) - New (03-Sept-2026).xlsx"
//   bun prisma/import-factors.ts          --file "docs/sample-data/CEC-PR-F-024 - DASHBOARD (2025) - New (03-Sept-2026).xlsx"
//   bun prisma/reapply-2026-09-03-factor-correction.ts --apply --file "<same workbook>"
//   bun prisma/repoint-renamed-factors.ts            (fill PAIRS from the printed candidates first)
//   bun prisma/fix-travel-factors.ts --apply         (the official sheet still carries the
//                                                     overstated per-mile values, so this is
//                                                     re-applied last and is idempotent)
// then set the flag below to true and redeploy.
export const FACTOR_CORRECTION_APPLIED = false;

/** The date the notice states, kept beside the flag so the two cannot drift apart. */
export const FACTOR_CORRECTION_DATE = "2026-09-03";
