# Excel parity fixtures

This directory is the golden-fixture store for the project's actual acceptance test
(Requirements section 14.1: "for an agreed set of sample companies, the tool reproduces the
Excel's CO2e totals").

## The state of things

**No fixture from CECODES exists yet.** The only workbook we have
(`docs/reference/CEC-PR-CTE-127 ...xlsx`) is the **factor library**: it holds the emission factors
and the change log, but no company's activity data and no computed totals. There is therefore
nothing yet to compare against, and `parity.test.ts` carries a permanent `todo` saying so.

Obtaining a filled-in calculation workbook is item 0 of
[docs/CLIENT_DECISION_MEMO.md](../../../../../docs/CLIENT_DECISION_MEMO.md), and it is the single
thing that cannot be worked around.

`hand-computed-reference.json` is a placeholder. It proves the harness works and that the engine is
**self-consistent**. It does **not** prove parity: its expected values were derived by hand from the
same formulas the engine implements, so of course they agree. Do not mistake a green suite for a
passed acceptance test.

## Adding CECODES's workbook when it arrives

1. Transcribe one company-year into a new file here, e.g. `cecodes-alimentos-2024.json`.
2. Set `"origin": "client"` and fill `"source"` with the file name and sheet you took it from.
3. Copy the activity data into `entries`, and the **Excel's own totals** into `expected`.
   Take the totals from the spreadsheet, never from our app: the whole point is to compare them.
4. Run `bun run test src/lib/calc`.

A failure prints the scope, the category and both numbers, so a mismatch names the row rather than
just saying "615.82 is not 610.11".

## The two things most likely to make it fail first

1. **The CH4 GWP selector** (memo item 1). The Excel's `Hoja2` glosses its two CH4 values as
   "SÓLO COMBUSTIBLES" (29.8) and "LO QUE NO ES COMBUSTIBLE" (27), i.e. it appears to select by
   *is it a fuel*. We select by the *biogenic* column. The rules disagree on roughly 180 rows. The
   engine takes a `ch4Rule` so both can be tried: a fixture may set `"ch4Rule": "is-a-fuel"` and,
   if that is what makes the client's numbers reproduce, we have our answer empirically.
2. **The 2021 GWP boundary** (memo item 2). `Hoja2` lists only AR6 values, but `resolveGwpSet`
   sends 2021 and earlier to AR5. A 2021 fixture will settle it.

## Format

See `hand-computed-reference.json`. `value` and every factor field are **strings**, never numbers:
they are Decimals in the database and must not be rounded by JSON parsing on the way in.
