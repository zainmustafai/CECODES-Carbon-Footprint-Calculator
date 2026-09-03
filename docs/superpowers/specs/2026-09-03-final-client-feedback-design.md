# Design: 03-Sept-2026 final client feedback

Status: approved 2026-09-03. Supersedes nothing; extends the work shipped in `c08f72e`.

## Context

After real-life testing, CECODES sent a final feedback round: `docs/reference/September-03-2026-COMMENTS.pdf`,
four transport templates (`docs/sample-data/reherramientahuelladecarbono.zip`), the Spanish user guide
(`public/Herramienta de Huella de Carbono - Guía.pdf`), and a workbook they called the official factor table.

Investigating the supplied files before designing changed the picture in three ways that the feedback text
alone does not convey.

### The "new" workbook is not new

`CEC-PR-F-024 - DASHBOARD (2025) - New (03-Sept-2026).xlsx` is byte-identical to the July copy already in the
repo (MD5 `c20335e937a7a80e7332381a69c1dfdc`). The client is not sending new numbers; they are telling us which
table is authoritative: the `Emission Factors` sheet of that workbook, not
`docs/reference/CEC-PR-CTE-127 - Factores de emisión - Herramienta HC CECODES.xlsx` (sheet
`Jerarquía nueva (2025)`), which `prisma/import-factors.ts` has been reading.

### Root cause of "some emission factors are wrong"

Both sheets carry identical 45 column layouts, so they are directly comparable. Diffed on the natural key
(scope, category, subcategory, element, unit): 213 rows differ, overwhelmingly CH4 and N2O. The official sheet
applies a `/1000` conversion the old one lacks, and in places corrects the coefficient too:

| Element | Old sheet (what we imported) | Official sheet |
| --- | --- | --- |
| Coque | `=1*28.2` gives 28.2 g, stored 0.0282 kg | `=(10*28.2)/1000` gives 0.282 g, stored 0.000282 kg |
| Carbón Vegetal | `=200*29.5` gives 5900 g, stored 5.9 kg | `=(200*29.5)/1000` gives 5.9 g, stored 0.0059 kg |
| Gas Natural Genérico - Fijo | 357, stored 357 kg | 0.0357, stored 0.0000357 kg |

The ratios are not uniform (100x, 1000x and 10000x appear) because the old sheet's kilogram column was
sometimes undivided as well. The importer's own grams to kilograms logic is correct and needs no change; it
was fed the wrong sheet. The official table additionally upgrades 60 refrigerant CO2e factors from AR5 to AR6
and divides 53 Scope 3 C1 spend based factors by 1000.

### Two defects found en route, neither reported by the client

1. A previously shipped km/mile correction (`prisma/fix-travel-factors.ts`) has already been silently reverted
   for C6 Viajes Terrestres and all of C7. A rename in the workbook caused the importer to create a new factor
   row while existing activity entries stayed bound to the old one, so the company is still priced by the stale
   factor. Any re-import repeats this unless entries are re-pointed deliberately.
2. `load-report.ts` does not select `gasType`, so every pre-blended HFC/PFC/SF6/NF3 in a report is bucketed as
   "Otros gases sin identificar", while the dashboard, whose query does select it, names the same gases
   correctly. One dataset, two answers.

### The client's own pivot is a stale cache

Their `Tablas dinámicas` sheet disagrees with their own `PRINCIPAL` sheet in the same file: the pivot's
Alcance 1 total is 12020.95 t against PRINCIPAL's 11852.83 t, and "Fugas de Propano Alta Calidad / R-290"
reads 18.798 t where PRINCIPAL computes 6266 x 0.02 = 0.12532 t. Excel parity must be driven from PRINCIPAL.
The in-repo fixture `src/lib/calc/__tests__/fixtures/parity/cecodes-dashboard-principal-2024.json` already
carries the corrected factor values, so the re-import makes production agree with what the acceptance test has
been asserting all along.

## Decisions taken

| Decision | Choice | Why |
| --- | --- | --- |
| Transport entry for C4/C6/C7/C9 | In-app trip rows | Keeps trip level detail in the database and auditable, no Excel round trip, no spreadsheet parsing to harden |
| Report restructure scope | PDF only | Excel and CSV exist so CECODES can reconcile raw numbers against their spreadsheet; removing the per element sheet would destroy that |
| Historical restatement | Correct and disclose | Numbers become right, and a dated notice explains why a report pulled today differs from one pulled last month |
| Company header fields | Add them to the company profile | Their tool collects NIT, colaboradores, responsable, cargo, teléfono and web; a header built from name and sector alone would not be the thing they asked for |
| Excel ISO sheet | Fix the gasType defect, leave the structure | Prevents the Excel and the PDF from stating different gas breakdowns, without restructuring an export that is out of scope |

## Architecture

The one real fork is how per-gas data reaches the dashboard and the ISO pivot.

**Chosen: extend the existing rollup in place.** `GasBreakdownKg` grows to carry gas mass alongside the CO2e it
already returns, CH4 splits into fossil and non-fossil, pre-blended gases keep their name, and the breakdown is
carried down to `ElementTotal`. One engine change then serves D1, D2, E2 and R1.

**Rejected: a parallel gas ledger pass.** Lower risk to existing totals, but it creates a second derivation of
the same numbers. That is the failure this codebase already has twice: the dashboard names SF6 while the report
says "Otros gases", and the dashboard and the PDF compute the filtered total by different routes. One source of
truth guarded by an invariant beats two that drift.

**Rejected: persisting results.** `ResultSnapshot` exists in the schema and nothing writes it. Snapshotting
would make historical reports reproducible across the factor correction, but it is a feature in its own right
and the dated disclosure covers the same client trust need at a fraction of the cost.

The safety property that makes the engine change safe is already tested and must survive: for every factor
shape, `co2Kg + ch4Kg + n2oKg + otherKg` equals `computeCo2eKg`, and for every category the gas fields sum to
`tonnes` exactly. Both invariants become five way when CH4 splits, and must be rewritten deliberately rather
than patched, or they quietly stop covering the new bucket.

### Units in the ISO pivot

Verified arithmetically against the client's screenshot: the CO2, CH4 and N2O columns are gas mass in kg, while
the HFCs, PFCs, SF6 and NF3 columns are already CO2e. Row "C9: Transporte terrestre de carga" shows
4929185.89 + 38.81 x 29.8 + 155.25 x 273 = 4972725.6, matching its stated Total kg CO2e; row "C5: Residuos
sólidos a relleno sanitario semiaerobico" shows 275.35 x 27 = 7434.45 exactly. The pivot therefore mixes units
by design, which is their ISO declaration convention, and we follow their artifact rather than the house rule
that every user facing number is tonnes CO2e.

## Phases

Dependency ordered. Each phase ends green on `bun run typecheck && bun run lint && bun run test && bun run build`
plus an empty `prisma migrate diff`, and is committed separately.

### Phase 0: safety net

Today a green suite coexists with 213 wrong factors, because every parity fixture inlines its own factor values
and nothing binds the database library to the source workbook. Before touching data:

- A test that binds the imported factor library to the official workbook, so a bad or partial import fails loudly
  instead of passing silently.
- The first dashboard end to end spec. There is no `dashboard.spec.ts`; nothing in the suite could have caught
  the duplicated total the client reported, because the repo has zero component or render tests
  (Vitest runs in `node`, no jsdom, no testing library).

### Phase 1: factor correction (E1)

- Dry run the importer against the official sheet with `--file`, and read the KEPT list line by line.
  `resolveWorkbookPath` throws if a second `.xlsx` lands in `docs/reference`, so the flag is the supported route.
- Re-apply the rows the importer refuses. The overwrite guard keys on any `EmissionFactorChange` whose action is
  not `IMPORTED`, and four earlier fix scripts wrote exactly those, so those factors keep their wrong values
  while the run reports success.
- Re-point activity entries off stranded renamed factors. This is the mechanism that reverted the travel fix.
- Carry `entryMode` across renames. The importer never writes it, so a renamed row is created as `QUANTITY` and
  C4/C6/C7/C9 dual field entry silently collapses to a single pre-multiplied box, orphaning `secondaryValue`.
- Add the dated correction notice to the report and the dashboard.

### Phase 2: engine (serves D1, D2, E2, R1)

- `GasBreakdownKg` gains gas mass fields, a fossil and non-fossil CH4 split, and the pre-blended gas name.
- `ElementTotal` gains the breakdown; `CategoryTotal` gains the CH4 split.
- `load-report.ts` selects `gasType`.
- Excel parity re-proven against PRINCIPAL derived expectations.

### Phase 3: dashboard (D1 to D6)

- D6: delete the duplicated total card, and the duplicated category and element charts under it. The arithmetic
  is correct and is pinned by passing tests; the fix is render side only.
- D1 and D2: a fixed eight gas participation chart (CO2, CH4 no fósil, CH4 fósil, N2O, HFCs, PFCs, SF6, NF3)
  with the percentage table underneath.
- D3: line and points monthly chart, gaps preserved, dots visible.
- D4: Pareto with a single bar colour and the cumulative line, highlighting only elements up to the 85 percent
  crossing (the element that crosses is included), plus the ton CO2e and percent accumulated table.
- D5: company information header, backed by new company profile fields.

### Phase 4: transport trip rows (E3) and fuel prices (E4)

- A trip detail table under an activity entry, with its own Server Action. The existing autosave path writes at
  most two named columns per entry and cannot express N rows.
- Correct the aggregation: `preview.ts` currently computes the product of the sums rather than the sum of the
  products, which is right only while every source has exactly one row.
- Two fuel prices per year, with a typed fuel column on the factor. Element name matching is the fragile approach
  a previous migration explicitly rejected.
- Widen the price column: `Decimal(20,2)` and its Zod refinement reject the client's own 16046.315789473685.

### Phase 5: report rebuild (R1)

Order: company header, dashboard, emissions by category, the ISO 14064-1 pivot, then the remaining sections,
with the uncertainty table last. "Resumen por elemento" is dropped. The pivot is a three level hierarchy
(Alcance, Categoría, Elemento) with twelve columns and bold subtotal rows.

Constraints: the content box is 733.89 pt wide, so twelve columns fit only at about 6.5 to 7 pt with an explicit
font size on both the head row and the body rows; react-pdf does not error on overflow, it draws outside the box.
`read-pdf-text.ts` hardcodes A3 portrait height, so a landscape page would silently invalidate every layout
assertion on that page. Column headings must stay on one line, because react-pdf emits each wrapped line as its
own text draw and the layout test would then assert against a fragment nobody wrote.

### Phase 6: menu (M1) and user guide (G1)

- Swap the first two entries of `WORKSPACE_ITEMS`. One array, one consumer, and it reorders the admin drill down
  too. The post-login landing page is `/dashboard` in nine places and does not move.
- A download button for the Spanish guide. The proxy matcher does not exclude `.pdf`, so a signed out request is
  redirected to `/login`; the intro card is dismissed permanently per browser, so it cannot be the only home.

## Out of scope

Restructuring the Excel and CSV exports, an Excel upload path, persisting historical results, and moving the
post-login landing page.
