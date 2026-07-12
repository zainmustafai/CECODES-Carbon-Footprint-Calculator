# CECODES Completion Plan

**Status:** approved. **Scope:** take the app from its current state to delivery-ready.

This plan is grounded in a seven-agent read-only codebase audit plus an adversarial verification
pass. Every claim cites a file. Parts of the existing docs are stale and are corrected here; where a
doc and the code disagree, **the code wins and the doc gets fixed** (see §7, DoD item f).

## Decisions locked

- **No hard deadline.** Sequence for correctness: parity before features.
- **Reports are in v1: Excel/CSV first, then PDF.**
- **CECODES will answer the open decisions**, so blocked work is sequenced rather than guessed.
  Recommended defaults are supplied anyway so nothing stalls.
- **We correct the obviously wrong factors ourselves**, through the admin factor library so the
  change carries audit history. Genuinely ambiguous values are escalated.
- **The parity harness is built now** against hand-computed fixtures, so it is ready the day the
  client workbook arrives.
- **The CH4 GWP rule becomes configurable**, defaulting to today's behaviour.

---

## 1. The headline: the acceptance test is currently unfalsifiable

Requirements §14.1 defines done as "the tool reproduces the Excel's CO2e totals for an agreed set of
sample companies". **We have neither the sample company nor the spreadsheet that computes it.**

`docs/reference/` holds exactly one workbook,
`CEC-PR-CTE-127 - Factores de emisión - Herramienta HC CECODES.xlsx`. Its ten sheets are the
**factor library**, not the calculator: `Jerarquía nueva (2025)` (the per-gas table the importer
reads), `Factores de emisión` (the older 2024 table), `Control de Cambios`, the travel and spend
factor sheets, lookup lists, `Hoja2` (the GWP table), and `Hoja3`, which is a *sketch of the app*
("LOG IN / FILL THE FORM / TOOL WILL MAKE CALCULATIONS / DASHBOARD").

There is no worked example, no company totals, and no roll-up formulas. Parity is not merely
untested, it is **untestable**. This is blocked item 0 in §6 and it outranks every other blocker.

### The engine already disagrees with the Excel

`Hoja2` is the Excel's own GWP table:

```
PWC CO2 | 1
PWC CH4 | FOSIL    | SÓLO COMBUSTIBLES        | 29.8
PWC CH4 | NO FOSIL | LO QUE NO ES COMBUSTIBLE | 27
PWC N2O | 273   PWC NF3 | 17400   PWC SF6 | 24300
```

Our AR6 constants match it exactly (`src/lib/gwp.ts:18`). Our **CH4 selector does not**. The Excel
selects by *"is it a fuel"*; `src/lib/calc/engine.ts:38` selects by the **biogenic flag**. The two
rules disagree in both directions:

| Case | Rows (measured from column 8 of the sheet) | Our engine | Excel's stated rule |
| --- | --- | --- | --- |
| Biogenic **fuels** (bagazo, biodiesel) | 17 Fuentes Fijas + 3 Móviles | 27 | **29.8** |
| Non-biogenic **non-fuels** (fugitives, processes, land use) | 115 + 45 + 15 | 29.8 | **27** |

Which rule the Excel truly applies cannot be settled without its formulas. This is the sharpest
reason to demand the calculation workbook, and is very likely the first parity failure we would hit.

Related: `Hoja2` lists **only AR6** values, yet `resolveGwpSet` routes year <= 2021 to **AR5**
(`src/lib/gwp.ts:23`), whose CH4 collapses to a single 28 with no fossil split (`gwp.ts:17`). If the
Excel is AR6 throughout, every pre-2022 reporting year mismatches.

---

## 2. Ground-truth inventory

### BUILT

| Capability | Req | Evidence |
| --- | --- | --- |
| Per-source `activity x factor`, per-gas + GWP, consolidated CO2e short-circuit | §7.1 | `src/lib/calc/engine.ts:24-42` |
| GWP tables AR5/AR6; the set is pinned at reporting-year creation | §7.2 | `src/lib/gwp.ts:16-24`; `src/features/data-entry/actions/reporting-years.ts:45` |
| Roll-up to scope, category, company total; Scope 2 monthly series | §7.4 | `src/lib/calc/rollup.ts:76-147` |
| Every user-facing total in tonnes | §7.4 | `src/lib/gwp.ts:27`; `rollup.ts:116,140` |
| Data entry: Scope 2 monthly, Scopes 1 and 3 annual, decimals, autosave, resume | §6 | `src/features/data-entry/`; DB CHECK in `prisma/migrations/` |
| Decimal-as-string pipeline; storage never becomes a JS number | AGENTS | `src/features/data-entry/actions/entries.ts:138,196` |
| Dashboard: scope, category, Scope 2 monthly, year over year, Meta vs real, filters | §9 | `src/features/dashboard/` (nine components), `lib/dashboard-data.ts:22` |
| Factor library: create, edit, deactivate, search, filter, paginate (~1,721 rows) | §8 | `src/features/admin/actions/factor-actions.ts:53-185` |
| Factor audit trail with field-level diffs | §14.5 | `EmissionFactorChange` `prisma/schema.prisma:273-294`; `src/features/admin/lib/factor-diff.ts` |
| Grid electricity factor CRUD, per year | §7.3 | `factor-actions.ts:222-266` |
| Excel factor importer, idempotent, never overwrites an admin edit | §8 | `prisma/import-factors.ts`; `src/lib/factor-import/map-row.ts` |
| Company and user CRUD, active flags, temp passwords, admin drill-down | §5 | `src/features/admin/` |
| Multi-tenant isolation through a single boundary | §14.3 | `src/lib/auth/company-scope.ts` (26 unit tests) |
| es-CO and en i18n with a key-parity test | AGENTS | `src/messages/`, `src/messages/__tests__/messages.test.ts` |
| Preview / spreadsheet view of all entered data | new | `src/features/preview/` |
| Admin new-company onboarding wizard | new | `src/features/admin/components/company-onboarding-wizard.tsx` |
| App-shell-matched loading skeletons (14 routes) | new | `src/app/**/loading.tsx` |

### PARTIAL

| Capability | Req | Gap | Evidence |
| --- | --- | --- | --- |
| Roll-up hierarchy | §7.4 | Stops at **category**. No subcategory or element level; `RollupEntry` does not carry the fields | `rollup.ts:23-31,117-122` |
| Biogenic memo item | §12.A5 | Sums the **entire** CO2e, not the biogenic CO2 fraction | `rollup.ts:134` |
| Meta feature flag | §12.B9 | `FEATURE_SCOPE_TARGETS` gates only the data-entry card; the dashboard renders `MetaVsReal` and the target KPI unconditionally, so the flag does not revert | `src/lib/feature-flags.ts:4` vs `dashboard-screen.tsx:97,110` |
| Library versions | §8 | Create-only; `versionId` is overwritten on every edit, so it means "last touched in", not "introduced in" | `factor-actions.ts:125` |
| E2E suite | §14 | **RED.** `admin-companies.spec.ts:27-29` asserts a dialog that the wizard replaced | `e2e/admin-companies.spec.ts` |
| Server Action validation | §5 | `deleteFacility` has no Zod at all; the onboarding schema is not `.strict()`; `auth-actions.ts` has zero server-side Zod | `facility-actions.ts:85`; `onboarding-actions.ts:8`; `auth-actions.ts:25,67` |

### NOT BUILT

| Capability | Req | Evidence |
| --- | --- | --- |
| **Excel parity test / golden fixture** | §14.1 | No `engine.test.ts`; no test loads a workbook; the golden artifact does not exist |
| **Reports: PDF and Excel/CSV export** | §10, §14.7 | No `src/features/reports/`, no route, no Route Handler. `@react-pdf/renderer` (`package.json:28`) is imported nowhere; `exceljs` only in `prisma/import-factors.ts` |
| Per-gas breakdown retained through the roll-up | §7.4 | `engine.ts:41` returns a single scalar |
| Uncertainty (+/- %) in calc or UI | §12.A7 | `uncertaintyPct` is imported and admin-editable, and read by nothing |
| Spend-based COP/USD path | §7.3, §12.A4 | `co2eFactorCop` / `co2eFactorUsd` exist (`schema.prisma:244-245`) and are admin-editable, but `FactorInput` cannot see them |
| Unit conversions (km, passenger-km, calorific) | §12.A2 | No `1.609`, no `convertUnit` anywhere; conversions are assumed pre-baked into factor values |
| `ResultSnapshot` writer / factor-version pinning | §8 | The model is dead; the dashboard recomputes live (`dashboard-data.ts:19`) |
| Facility comparison; subcategory and element drill-down | §9 | No component |
| Read-only AUDITOR role | §12.B11 | `Role` is `COMPANY_USER \| CECODES_ADMIN` only (`schema.prisma:32`) |
| Cross-tenant e2e; any Server Action test | §14.3 | Zero |

---

## 3. Correctness defects (unblocked, ours to fix)

Ranked. These are bugs, not missing features.

**D1. Security: a deactivated user can create a company.** `createCompanyAction` calls
`requireUser()` (`src/features/onboarding/actions/onboarding-actions.ts:32`), which validates only
the Supabase session and **never reads `app_users.active`**. Every other server entry point does. A
deactivated, never-onboarded user holding a live session can POST this public endpoint and create a
real `Company` and `Facility` and link themselves to it. The schema is also not `.strict()`. This
contradicts the invariant asserted in `prisma/schema.prisma` and `company-scope.ts:37-39`.

**D2. Spend-based factors can silently compute 0 t.** An admin can fill only `co2eFactorUsd` or
`co2eFactorCop` (`factor-form.tsx:167-174`), but `engine.ts` cannot read those columns.
`rollup.ts:108` treats a non-null factor as computable, so the source lands in the totals as **0 t
with no warning** and the category looks complete.

**D3. `biogenicTonnes` sums the wrong quantity.** `rollup.ts:134` adds the entry's whole CO2e, not
its biogenic CO2 fraction. If the client rules "exclude biogenic from the headline", subtracting this
number would remove real, non-biogenic emissions from the total.

**D4. A missing grid factor injects a fabricated zero.** `rollup.ts:100-107` sets a boolean but falls
through, adding `0 t` into `byScope` and `byCategory`, guarded only by a flag the dashboard happens
to check. The preview table prints `-` while its KPI card prints `0,00 t`: the two screens disagree.

**D5. Year over year is silently understated.** `dashboard-data.ts:153-155` discards each prior
year's `missingGridFactor`, so a year with no grid factor becomes a shorter bar and a **false
reduction** in the KPI.

**D6. Autosave can drop an edit when the facility or year changes.** `ContextBar.go()` calls
`router.push` with no flush (`context-bar.tsx:41-45`) and `DataEntryProvider` is not keyed, so the
unmount-flush never runs. The blur-flush usually wins the race, but it is a race.

**D7. `setFactorActive` writes a fabricated audit diff** from an assumed prior state
(`factor-actions.ts:159`) rather than reading the row, and permanently marks the factor
"human-edited" so the importer will never update it again. The importer's own starter cleanup has the
same effect (`import-factors.ts:349-357`).

**D8. Renaming a factor creates a duplicate on the next import.** Editing the natural key defeats the
importer's `findFirst` match, so the next run creates a second row alongside the renamed one.

**D9. Composite-FK protection was applied to one table of four.** Only `ActivityEntry` has it.
`CategoryApplicability`, `ScopeTarget` and `ResultSnapshot` carry a denormalized `companyId` with no
composite FK, so a wrong `companyId` is accepted by Postgres and then silently matches nothing.

**D10. Regressions introduced in the previous session.** `e2e/admin-companies.spec.ts` is red (it
asserts the create-dialog that the wizard replaced) and four em dashes were introduced into
`src/features/preview/`, which AGENTS.md forbids.

**D11. `package.json:12` still ships `"db:migrate": "prisma migrate dev"`** against the one shared
Supabase database. It does not work here and can prompt to reset. Delete it.

**D13. `notFound()` serves a 200, not a 404.** A company user hitting `/admin/companies` correctly
lands on the not-found page and sees no admin content, so tenant isolation holds. But the HTTP status
is **200**: the `(app)` layout (sidebar, topbar) has already streamed by the time the page calls
`notFound()`, so the response is committed before the 404 can be set. Not an isolation failure, and
an attacker learns nothing from a 200 that renders "Página no encontrada", but the status code lies
to monitoring and to any API client. Found by `e2e/cross-tenant.spec.ts`; worth fixing by moving the
admin guard into a layout or `proxy.ts` so the refusal happens before the shell renders.

**D14. The e2e suite poisoned its own session (fixed).** `auth.spec.ts` ran its logout test against
the SHARED company-user storage state. Supabase's `signOut()` revokes the refresh token server-side
and globally, so every spec Playwright ran afterwards (alphabetically: company-profile, cross-tenant,
data-entry, facilities-crud, meta) silently loaded a dead session and got bounced to `/login`. They
failed on assertions unrelated to what they tested, and some passed **vacuously**: an isolation test
asserting "the victim's name is not on this page" passes beautifully when the page is the login
screen. The logout test now provisions a disposable user of its own. This single flaw accounted for
most of the suite's redness.

**D12. Stale docs.** `IMPLEMENTATION.md:696` ("no roll ups ... the dashboard shows zeroes"),
`IMPLEMENTATION.md:142` ("factor library placeholder", "no real numbers yet"),
`src/features/data-entry/components/meta-card.tsx:18` ("Week 3 engine"), and `IMPLEMENTATION.md:582`
(lists five test files; there are twelve). Also AGENTS.md claims "**every page** ... calls
[company-scope] first" and **no page does**: pages use `requireAppUser` / `requireAdmin` and pass a
`companyId`. Safe today, but `loadDashboard` and `loadPreview` accept a `companyId` and query Prisma
with no authorization of their own. An unexploded landmine.

---

## 4. Phased work breakdown

### Phase 0: stop the bleeding

| Task | Files | Acceptance | Verify | Size | Risk |
| --- | --- | --- | --- | --- | --- |
| **0.1 Fix D1** | `onboarding-actions.ts`, `company-scope.ts`, `company-scope.test.ts` | A deactivated user's POST is refused; schema is `.strict()` | New unit test + cross-tenant e2e | S | Low |
| **0.2 Fix D10, D11** | `e2e/admin-companies.spec.ts`, `src/features/preview/*`, `package.json`, `messages.test.ts` | E2E green; zero em dashes in `src/**` and `*.md`; `db:migrate` gone | `bun run test`, `test:e2e` | S | Low |
| **0.3 Fix D12** | `IMPLEMENTATION.md`, `AGENTS.md`, `meta-card.tsx` | No stale claim survives | Read-through | S | None |

### Phase 1: make parity possible (critical path)

| Task | Why | Acceptance | Size | Deps |
| --- | --- | --- | --- | --- |
| **1.1 Send the client memo** (§6) | Nothing else unblocks §14.1 | Sent | S | none |
| **1.2 Build the parity harness now** with hand-computed fixtures; add the missing `engine.test.ts` | Turns a blocked task into a ready one | Harness green on hand-computed numbers; swapping the fixture file is the only change needed when the client's arrives | M | none |
| **1.3 Make the CH4 GWP rule configurable** (`biogenic-flag` \| `is-a-fuel`), defaulting to today's behaviour | Converts a blocking unknown into a measurable one; the harness can test **both** rules against the client workbook and infer which reproduces their totals | Both strategies unit-tested | S | 1.2 |
| **1.4 Fix the silent-zero family** (D2, D3, D4, D5) | A parity mismatch must surface as an error, never as a quietly smaller number | No uncomputable source ever aggregates as 0; preview and dashboard agree | M | 1.2 |
| **1.5 Extend the roll-up to element and subcategory** | Required by §7.4; the Excel export needs it anyway | `rollupYear` groups down to element | M | 1.2 |

### Phase 2: reports (Excel first, then PDF)

| Task | Notes | Size | Deps |
| --- | --- | --- | --- |
| **2.1 Excel/CSV export** | Serialize the roll-up, never re-implement math. Deliver as a **Route Handler** that streams the file, with `resolveCompanyScope` as its **first call** (a Route Handler sits outside every layout guard). Acceptance: opens in Excel, totals identical to the dashboard, es-CO formatting correct | M | 1.4, 1.5 |
| **2.2 PDF report** | `@react-pdf/renderer` is already a dependency. Recharts is client-side SVG and will not render server-side, so **render the numbers as tables in v1** rather than fighting a headless browser. Must include company, facility, year, GWP set, totals by scope and category, the applicability disclosures (the GHG Protocol requires them), and a methodology note | L | 2.1 |
| **2.3 Reproducibility** | Reports are the first artifact that leaves the building. With no `ResultSnapshot` and no `factorVersionId` stamped, two PDFs of the same year can legitimately disagree. **Recommend: stamp the library version on the report now, defer the snapshot writer** | S / L | 2.1 |

### Phase 3: close the verification debt

- **3.1 Cross-tenant e2e and Server Action tests.** Sign in as company A, fire every action with
  company B's ids, assert refusal. Test `resolveFacilityScope` (today untested) and `.strict()`
  rejection. Stay inside the `E2E ` namespace on the shared DB. **This is the only thing that proves
  the security model end to end.** Size: M.
- **3.2 E2E for the new features**: the onboarding wizard, `/preview`, the consolidated `/company`,
  and the admin drill-down `/admin/companies/[id]/*`, which has **zero** coverage today. Size: M.
- **3.3 Browser-drive everything** and run the full suite green.
- **3.4 Quality gates**: enable component tests (`vitest.config.ts:8` matches only `*.test.ts`, so no
  `.tsx` test can ever run), add ICU placeholder parity, add one e2e that flips the language toggle
  (the `en` locale is never rendered in CI today), fix the five hardcoded strings and three
  mismatched skeletons, add the missing `/onboarding` `loading.tsx`. Size: M.

### Phase 4: land the client answers

Each answer is a small, contained change: the GWP rule (1.3), the grid factors and the travel/spend
corrections (admin UI, audited), the currency handling, the Meta flag, the auditor role, and the
seven empty Scope 3 categories.

---

## 5. Critical path

```
D1 security ─┐
red e2e      ├─> PHASE 0 (unblocked, do now)
stale docs  ─┘
                  │
MEMO item 0 ──────┼──────────────> [CECODES] ──> real fixture ──┐
                  │                                              │
parity harness ───┴─> configurable CH4 ─> silent-zero fixes ─────┴─> PARITY PASSES
                                              │
                                              └─> roll-up to element ─> Excel ─> PDF
                                                                          │
                                          cross-tenant e2e ───────────────┴─> DELIVERY
```

**The long pole is the client, not the code.** Everything left of `[CECODES]` is ours and starts
today.

---

## 6. Client decision memo

Sent separately as `docs/CLIENT_DECISION_MEMO.md`. Ten items; item 0 is new and outranks the rest.

---

## 7. Risk register

| Risk | Severity | Why | Mitigation |
| --- | --- | --- | --- |
| **Parity is unfalsifiable** | Critical | The golden artifact does not exist, so §14.1 cannot be run at all | Memo item 0 on day one; build the harness now so it is ready when the workbook lands |
| **The reference spreadsheet is known to be wrong** | Critical | §12.2 (inverted km conversion), §12.3 (implausible spend factors). Parity with a buggy source is a contradiction: matching it ships the bug, not matching it fails acceptance | Get written agreement on **which** Excel we are matching: as-is, or corrected |
| **Silent undercounting** | High | `parseActivity` returns 0 on anything unparseable; a missing grid factor adds a real 0; spend-only factors compute 0. A mismatch appears as a quietly smaller number, not an error | Phase 1.4. Never aggregate an uncomputable source |
| Security (D1) | High | A deactivated user can write tenant data | Phase 0.1 |
| No cross-tenant test | High | The isolation claim rests on 26 unit tests and zero HTTP-level proof | Phase 3.1 |
| **One shared Supabase database** | High | Dev, demo and e2e share it, and `db:migrate` is still in `package.json` | Delete the script; keep e2e in the `E2E ` namespace; never reset or truncate |
| Factor-data quality | High | Five disputed grid factors, inverted travel factors, implausible spend factors, seven empty categories, `gwpSet` NULL on every imported row | Memo items 5 to 9; corrections land through the audited admin UI, never by hand in the DB |
| Importer lock-out (D7, D8) | Medium | Factors get marked "human-edited" forever; renaming one spawns a duplicate on re-import | Fix alongside the Phase 1 calc work |
| No reproducibility | Medium | Nothing writes `ResultSnapshot`; no `factorVersionId` is pinned | Phase 2.3 |
| The `en` locale is never rendered in CI | Low | Key parity is tested; runtime rendering is not | Phase 3.4 |

---

## 8. Definition of done

**Parity (§14.1)**
- [ ] Client's filled-in calculation workbook received
- [ ] Golden fixture committed under `src/lib/calc/__tests__/`
- [ ] `engine.test.ts` exists
- [ ] Parity test reproduces the Excel's totals per scope and overall, within tolerance
- [ ] The CH4 GWP rule is settled and the code matches the answer

**Coverage (§14.2)**
- [ ] Every confirmed factor can be entered and calculated
- [ ] The spend-based COP/USD path computes, or is deferred with written sign-off
- [ ] The seven empty Scope 3 categories are delivered, or deferred with written sign-off

**Accounts (§14.3)**
- [ ] D1 fixed; deactivated users refused at every entry point
- [ ] Every Server Action: strict Zod, company-scope, count check
- [ ] Cross-tenant e2e proves isolation over HTTP
- [ ] `resolveFacilityScope` is tested

**Data entry (§14.4)**
- [ ] Scope 2 monthly, Scopes 1 and 3 annual (keep the DB CHECK)
- [ ] Autosave cannot silently drop an edit (D6)

**Factor library (§14.5)**
- [ ] An admin edit visibly recalculates results
- [ ] The audit trail is truthful (D7) and re-import is safe (D8)

**Dashboard (§14.6)**
- [ ] No fabricated zeros (D2, D3, D4, D5)
- [ ] The Meta flag actually reverts the dashboard

**Reports (§14.7)**
- [ ] Excel/CSV export; totals identical to the dashboard
- [ ] PDF report with methodology and applicability disclosures
- [ ] The export authorizes through company-scope as its first call

**Gates**
- [ ] typecheck, lint, unit, build, and **e2e** all green (e2e is red today)
- [ ] Driven in a real browser
- [ ] The `en` locale rendered at least once in CI

**Hygiene**
- [ ] All four stale doc claims corrected, plus the false AGENTS.md "every page" claim
- [ ] No unlabeled TODOs; no em dashes anywhere
- [ ] `db:migrate` deleted
