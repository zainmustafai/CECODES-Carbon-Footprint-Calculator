# Superseded workbooks

Kept for provenance, **excluded from the Docker image** (see `.dockerignore`) and never resolved
by `prisma/import-factors.ts`, which reads only the single `.xlsx` at the top of `docs/reference`.

## CEC-PR-CTE-127 - Factores de emision (PRE-CORRECTION, do not import).xlsx

The emission-factor workbook as CECODES first sent it (2026-07-08). **Do not import it.** It
predates the correction CECODES confirmed on 2026-09-03: 213 rows carry CH4 and N2O factors that
are 1.000x too large, because the official sheet applies a division by 1.000 this one lacks.

    Gas Natural Generico - Fijo    this file: CH4 357      official: CH4 0,0357
    Coque                          this file: CH4 28,2     official: CH4 0,282

Importing it would not fail. It would silently multiply the methane and nitrous-oxide half of
every fuel row by a thousand and publish the result as a footprint. See `src/lib/factor-correction.ts`
for what the correction actually changed and when it was applied.

The file that supersedes it is the "Emission Factors" sheet of the DASHBOARD workbook, which
CECODES confirmed as the official table, and which now sits at the top of `docs/reference`.
