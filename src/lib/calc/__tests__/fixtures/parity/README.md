# Excel parity fixtures

This directory is the golden-fixture store for the project's actual acceptance test
(Requirements section 14.1: "for an agreed set of sample companies, the tool reproduces the
Excel's CO2e totals").

## The state of things

**A client-origin fixture exists and passes: `cecodes-dashboard-principal-2024.json`.**

On 2026-07-24 CECODES sent `docs/sample-data/CEC-PR-F-024 - DASHBOARD (2025).xlsx`, a
temporary-use calculation workbook whose PRINCIPAL sheet contains a filled-in sample company
(four sedes, ten emission rows, twelve monthly electricity values) together with the Excel's
own cached formula results per row and in total. That fixture transcribes the inputs and the
**Excel's own outputs**, cell by cell, and `parity.test.ts` reproduces them through
`rollupYear`. The standing `it.todo` reminder retired itself the moment the fixture landed.

The same workbook settled the two questions this README used to warn about:

1. **The CH4 GWP selector**: the PRINCIPAL formulas split CH4 with
   `IF(VLOOKUP(...) = 1, ...no fósil..., ...fósil...)` on the factor library's biogenic
   column. That IS the biogenic-flag rule, executed. See `../../ch4-rule.ts`.
2. **The GWP vintage**: every formula multiplies by the AR6 column, for any year entered.
   `resolveGwpSet` now returns AR6 unconditionally. See `../../../gwp.ts`.

Two of the workbook's tables are deliberately outside the fixture: BASE_remociones (removals
sit in their own table with their own total, never added to emissions) and BASE_evitadas
(tecnologías más limpias: reported, never calculated - CECODES 2026-07-24).

One anomaly is reproduced faithfully rather than corrected: the workbook's urea factor
(0.7333 = 0.2 × 44/12, a CO2 quantity labelled "kg CO2e/kg urea") sits in the factor sheet's
N2O column, so the Excel multiplies it by 273. Parity means matching what the spreadsheet
executes; the anomaly is flagged to CECODES separately.

`hand-computed-reference.json` remains as a harness self-check. It proves the fixture
machinery works; only the client-origin fixture proves parity.

## Adding further client workbooks

1. Transcribe one company-year into a new file here.
2. Set `"origin": "client"` and fill `"source"` with the file name and sheet you took it from.
3. Copy the activity data into `entries`, and the **Excel's own totals** into `expected`.
   Take the totals from the spreadsheet, never from our app: the whole point is to compare them.
4. Run `bun run test src/lib/calc`.

A failure prints the scope, the category and both numbers, so a mismatch names the row rather
than just saying "615.82 is not 610.11".

## Format

See the fixtures. `value` and every factor field are **strings**, never numbers: they are
Decimals in the database and must not be rounded by JSON parsing on the way in.
