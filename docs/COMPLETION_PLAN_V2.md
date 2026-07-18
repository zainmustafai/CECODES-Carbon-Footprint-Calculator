# CECODES Completion Plan v2

**Supersedes** [COMPLETION_PLAN.md](./COMPLETION_PLAN.md) (2026-07-11), which predates CECODES's
answers and lists as NOT BUILT several things that now exist (parity harness, full §7.4 roll-up,
Excel/CSV export, cross-tenant E2E). Read this one.

**Written:** 2026-07-17, after CECODES answered the round-1 decision memo and added a new
traceability requirement.

---

## 1. What "done" means here

§14.1 makes reproducing CECODES's Excel totals *the* acceptance test. They have not sent a workbook.
So "all features built" is not a finish line anybody can stand behind, and this plan does not use it.

| | Definition | Who controls it |
| --- | --- | --- |
| **DONE-A** | Every path we can build is built, tested, and driven in a browser | Us |
| **DONE-B** | Every client-blocked item has a landed default, one named switch point, a test that fails if someone flips it without the missing input, and a stated cost-to-apply | Them |

The goal of DONE-B is that the day an answer arrives, applying it is minutes rather than weeks.
**A phase is not done because it compiles.** See §6.

**The hard rule, in force everywhere below:** never invent a factor, rate, or rule to unblock a
phase. A missing input surfaces as an explicit UI warning, never a silent zero and never a plausible
guess. This is not pedantry: a fabricated number that looks reasonable is undetectable downstream and
would corrupt the acceptance test we are being paid to pass.

---

## 2. Verified current state

Facts, each checked today rather than assumed.

| Fact | Evidence |
| --- | --- |
| `typecheck`, `lint`, `build` green; **219 unit tests + 1 todo** green | run 2026-07-17 |
| **E2E is RED: 6 failing, ~28 passing.** Pre-existing, not caused by recent work | `COMPLETION_PROMPT.md:110-118` names the same 6 specs observed in today's run |
| Travel factor correction **is applied in the database** | 9 rows, `changedByEmail = correccion-km-1609`, 2026-07-12; `Carro particular` 0.477873 to 0.1845867 (= 0.297/1.609) |
| **Zero mile-denominated units** exist in the library | DB query, 2026-07-17 |
| **No 2025 grid factor** exists, in our seed or either Excel sheet | DB query + workbook |
| Per-gas coverage: **Scope 1 = 79%, Scope 3 = 6.2%** (1,182 of 1,252 rows consolidated-only) | DB query, 2026-07-17 |
| CH4 rule swings **277 rows**; `FUEL_CATEGORIES` covers only 85 of 389 CH4-bearing rows | DB query + `ch4-rule.ts:42` |
| ActivityEntry write surface is **exactly 4 Server Actions**, all in one file | `entries.ts:41,112,141,178` |
| `db:seed` no longer reverts an admin's grid-factor resolution | fixed + proven today |

---

## 3. Dependency graph

```
P0 e2e green ───┬──> P2 traceability ──> P3 PDF report ──┬──> P6 acceptance dry-run
                │                                         │
                ├──> P4 per-gas (partial) ────────────────┤
                │                                         │
P1 DONE-B gates ┴──> P5 defect sweep ─────────────────────┘

Client inputs, each landing straight into a prepared switch:
  workbook (item 0) ──────────> P6 turns amber to green
  2025 grid factor ───────────> unlocks year floor + Scope 2
  fuel list ──────────────────> one-line CH4 flip
  sheet choice ───────────────> grid values + audit note
  Meta rules ─────────────────> P5b (migration, sized below)
  uncertainty shape ──────────> P3 table body
  spend units, THEN fx rate ──> P5c
```

**Hard ordering constraint:** item 7 (spend factor units) must precede any FX work. Cement reads
≈3,924 kg CO2e/USD against an FX rate of ≈3,743, which is strong evidence the factors are per-COP
mislabelled as per-USD. Applying an exchange rate on top of a currency error produces totals that are
wrong *and* plausible, which is the worst possible failure. **Do not build P5c until A3 is answered.**

**P0 gates everything with a UI surface.** While the suite is red, "verified in a browser" is a claim
we cannot make, and the whole plan leans on it.

---

## 4. The phases

### P0. Make the E2E suite genuinely green

**Goal:** turn "verified" from a claim into a fact. **Serves DONE-A** (it is the precondition for it).

- **Entry:** none. This is first.
- **Exit:** `bun run test:e2e` exits 0, run for real, output pasted into the commit. No assertion
  weakened to get there. `SELECT count(*) FROM companies WHERE name LIKE 'E2E %'` returns 0.
- **Files:** the 6 red specs; likely `TextField`/session/timing fixes rather than product changes.
- **Verify:** the suite itself, plus a read of *why* each failed.
- **Blast radius:** low. Test-only unless a real product bug surfaces, in which case fix the product
  and say so.
- **Non-goals:** do not add new E2E coverage here. Green first, breadth later.
- **Size:** ~half a day. **Risk:** the failures may be 6 separate causes rather than one.

> The known trap, already paid for once today: the 2025 year floor passed typecheck, lint, 219 unit
> tests, and build, and broke 7 E2E specs. Static green means nothing about the UI.

---

### P1. Quarantine every client blocker properly (DONE-B)

**Goal:** make each blocked item safe, visible, and one edit away from done. **Serves DONE-B.**

Mostly landed today; this phase finishes it and makes it uniform.

| Blocker | Default in force | Switch point | Guard test | Cost to apply |
| --- | --- | --- | --- | --- |
| **1. Workbook (item 0)** | none possible | `parity.test.ts` fixture with `"origin": "client"` | the standing `it.todo` (never delete it) | transcribe fixture, run, read the named row |
| **2. 2025 grid factor** | none; `missingGridFactor` warning | admin grid tab | `reporting-year-schema.test.ts` fails if the floor rises with no creatable year having a factor | insert one row |
| **3. CH4 rule** | `biogenic-flag` | `ch4-rule.ts:34` + `FUEL_CATEGORIES:42` | `ch4-rule.test.ts` pins both rules | flip + category list, ~1h |
| **4. Grid sheet** | 2024 sheet values loaded | admin resolution + `seed.ts` list | seed no longer overwrites (fixed today) | re-resolve per year in the UI |
| **5. Meta rules** | per-Sede absolute tonnes | `ScopeTarget` model | `scope-target-schema.test.ts` (9 tests) | **ANSWERED 2026-07-18: total %, company-wide. Buildable, see P5b** |
| **6. Uncertainty shape** | stored, shown nowhere | `load-report.ts` select | none yet | table body only, ~2h |
| **7. Spend units + FX** | spend path unbuilt | `isPriceable` `rollup.ts:122` | `rollup.test.ts:218` pins the exclusion | **FX answered (year-avg); still gated on A3 units. See P5c** |

- **Exit:** every row above true, and the round-2 memo matches the code exactly.
- **Verify:** unit tests; grep that no default is duplicated in two places.
- **Non-goals:** do not apply any blocked answer. Do not seed 3300 or a 2025 factor.
- **Size:** ~2h remaining. **Risk:** low, but it is the phase that keeps every later phase honest.

---

### P2. Traceability: who did what (the new client requirement)

**Goal:** CECODES can ask "who entered this number?" and get a name, for every value. **DONE-A.**

CECODES, 2026-07-17: *"Some companies may have more than one authorized person to access the app.
For traceability purposes, we need the person to specify who they are each time the exercise is
done."* Decisions taken: **real per-person accounts** (not a typed name box, which is forgeable and
skippable), **full change history** (not last-writer), **block the duplicate-company bug** while they
answer how colleagues should be provisioned.

- **Entry:** P0 green.
- **Exit, all observable in a browser:**
  1. Two users of one company each edit a value; the history shows each edit with who, when, from, to.
  2. Deleting a user leaves their history rows intact and still readable.
  3. A colleague self-registering no longer creates a duplicate company; they get an opaque i18n
     error pointing them at CECODES.
  4. Admin can set name and phone; both appear in the users list.
- **Files / migration (hand-authored SQL, `IMPLEMENTATION.md` §7):**
  - `app_users`: add `name`, `phone`, `position` _(cargo)_, all nullable TEXT. CECODES confirmed the
    fields on 2026-07-18: *"name, phone, email and position"* (email exists). Nullable is deliberate:
    required would break `/register` and every existing fixture, and the fields did not exist when
    those users were created.
  - new `activity_entry_changes`, mirroring `EmissionFactorChange` (`schema.prisma:281-294`):
    `changedById` (AppUser?, `onDelete: SetNull`) **plus denormalized `changedByEmail`**, because the
    audit row must outlive the actor. Add the RLS policy block for consistency (inert, per §7).
  - all 4 write sites in `entries.ts`: `addSource:41`, `removeSource:112`, `saveEntryValues:141`,
    `copyJanuaryToAll:178`. Each already calls `resolveReportingYearScope`, so the actor is in hand.
  - `onboarding-actions.ts:65-73`: stop creating a Company for an unlinked user.
  - `user-schemas.ts` (`.strict()`, so it rejects `name`/`phone` until changed), `user-actions.ts`,
    `user-dialog.tsx`, `users-screen.tsx`, `src/messages/{en,es}.json`.
- **Two traps the map surfaced:**
  - `createMany` returns only `{ count }`, not ids. Use `createManyAndReturn` or per-row create, or
    the 12 Scope-2 rows land with no audit rows.
  - `deleteMany` destroys the evidence. Read the doomed rows **before** deleting, inside the same
    transaction, or the delete is unattributable.
- **Verify:** unit tests per write site; E2E driving two users editing the same value; then a browser.
- **Blast radius:** `e2e/onboarding.spec.ts` asserts the old duplicate-creating flow and **will
  need rewriting, not weakening**. `action-authorization.test.ts` touches these actions. Revert cost:
  the migration is additive, so revert is a code revert plus two dead columns.
- **Non-goals:** no invite emails (no SMTP exists), no join-request flow, no AUDITOR role (deferred),
  no per-exercise signature unless CECODES asks after seeing real accounts work.
- **Size:** ~2 days. **Risk:** medium, it is the first migration on the shared DB in a while.

> **Tell CECODES, in the memo, not after:** every value already entered has **no attribution and can
> never get one**. The log starts the day it ships. Every day of delay is another day of
> unattributable data.

---

### P3. The PDF report (§10, §14.7): the last unbuilt requirement

**Goal:** CECODES can export a PDF whose numbers match the dashboard. **DONE-A**, with a **DONE-B**
slot for uncertainty.

- **Entry:** P0 green. P2 is independent but should land first (the report should name who produced it).
- **Exit:** a PDF downloads for a real company-year; totals equal the dashboard's to the last decimal;
  it renders in Spanish and English; the route calls `resolveCompanyScope` first.
- **Files:** `src/features/reports/` (Excel/CSV already lives here; share `rollupYear` via
  `load-report.ts:102` so the two exports cannot diverge), a new Route Handler mirroring
  `src/app/api/reports/export/route.ts:41`. `@react-pdf/renderer` is a dependency imported nowhere.
- **The uncertainty slot:** CECODES reversed the v1 default and wants uncertainty in the PDF summary.
  **Build the per-element list** (needs no maths, buildable today). **Do not build a combined figure:**
  no propagation method exists in the repo, their Excel has no roll-up to copy, so parity gives no
  answer, and inventing one would put a fabricated statistic in the first artifact that leaves the
  building. Coverage is 40% of Scope 1 and 15% of Scope 3 and **electricity has none at all**, so
  blanks must read "no disponible" rather than be silently dropped.
- **Verify:** build a PDF, open it, compare every total against the dashboard by eye and by test.
- **Blast radius:** new surface, low risk. Correct `IMPLEMENTATION.md:726-727`, which still claims
  exceljs is imported nowhere (it is, `build-workbook.ts:1`).
- **Non-goals:** no combined uncertainty. No charts in the PDF unless asked.
- **Size:** ~2 days. **Risk:** low.

---

### P4. Per-gas breakdown (CO2 / CH4 / N2O)

**Goal:** the dashboard shows a gas inventory, honestly. **DONE-A, partially data-blocked.**

- **Entry:** P0 green. **CECODES has seen the coverage number** (see below).
- **The problem they have not seen yet:** Scope 3 is **6.2%** per-gas. A gas chart renders the
  largest scope as one enormous unattributable wedge. This is a data gap, not an engineering gap, and
  they must see the number before we build to it. **This phase is blocked on showing them, not on
  asking permission.**
- **Files:** the split is computed then thrown away at `engine.ts:45-49`. Add `computeGasKg` and
  reimplement `computeCo2eKg` as its sum, so the scalar and split paths cannot diverge. Never fold
  the `co2eFactor` short-circuit (`engine.ts:37-40`) into CO2: it gets a fourth "unattributed"
  bucket. Precedent to copy verbatim: `biogenicCo2Tonnes` / `biogenicCo2Partial`, `rollup.ts:245-265`.
- **Exit:** per-gas parts sum **exactly** to the existing scalar for every fixture. That test is the
  whole safety argument: this must be a pure refactor of a number that already ships.
- **Verify:** engine tests pinning the sum; then the chart in a browser.
- **Blast radius:** engine. `rollup.ts:70-71` records that two-engines-that-disagree already happened
  here once. Do not add a second engine.
- **Non-goals:** do not bundle uncertainty (schema cannot express it per gas, single
  `uncertaintyPct` at `schema.prisma:251`). Do not add a refrigerants bucket without a migration
  decision.
- **Size:** ~1 day. **Risk:** medium, it touches the number the whole product exists to produce.

---

### P5. Defect sweep and the landed answers

**P5a. Remaining defects** (from COMPLETION_PLAN v1's D-list, re-audit which survive):
D9 composite-FK on 3 of 4 tables, D11 `db:migrate` still ships `prisma migrate dev` against the
shared DB (delete it), D13 `notFound()` serves 200. **Size:** ~1 day.

**P5b. Meta rebuild** *(ANSWERED 2026-07-18: percentage, company-wide total, not per-scope, fixed
first-year baseline. One axis to confirm before the migration lands.)* The Meta becomes: **one
percentage per company per baseline year**, never set in the first reported year. This kills the
per-scope model outright. Two shapes remain, and they differ only in blast radius:
- **Company-wide (assumed):** re-key targets from `reportingYearId` (per-facility) to the company.
  A **table replacement**, because `ScopeTarget` hangs off a per-facility key that a company-wide
  number does not fit. This is the expensive, one-way-door option.
- **Per-Sede total (alternate):** keep the key, drop the `scope` column, store a percentage. An
  **ALTER**, cheap.
"General total goal" and their "2025 total emissions" example both point company-wide, so **build
company-wide but confirm the axis before applying the migration** on the shared DB. Existing rows
store absolute tonnes with no baseline and **cannot be mechanically converted**: drop or hand-migrate.
Rewrites both dashboard surfaces (`MetaVsReal`, `TargetKpi`) from per-scope to one figure, and
`scope-target-schema.test.ts` (9 tests pinning the tonnes contract). The feature flag
`FEATURE_SCOPE_TARGETS` is already `true`. **Size:** ~2 days. **Buildable now; hold the migration
apply for the one-line axis confirmation.**

**P5c. Spend-based COP/USD** *(FX rate ANSWERED 2026-07-18: per-year, year-average TRM. STILL gated
on A3 units.)* Entirely unbuilt: schema, migration, engine path, admin UI. Per-year rate table
modelled on `grid_electricity_factors`, values = each year's average TRM. A year with no rate must
refuse to price and surface it, never fall back to a default. Pin the Excel's ~3,743 (its year's
average) for the Excel's own year or §14.1 can never pass. **The rate mechanism is now fully
specified, but do not build it before A3:** the spend factors carry a likely per-COP/per-USD unit
error, and an FX conversion on top makes the totals wrong and plausible at once. **Size:** ~2 days.
**Do not start before A3.**

---

### P6. Acceptance dry-run and release readiness

**Goal:** prove we are ready for the workbook the moment it lands. **DONE-A.**

- **Entry:** P0 to P4 green.
- **Exit:** a full pass of the §14 checklist with each item marked green, amber (blocked, with the
  named input), or red. Run the parity harness against the hand-computed fixture and confirm it names
  the exact `(scope, category)` row on a deliberate mismatch. That rehearsal is the deliverable: it
  proves the harness works before the real file arrives.
- **Verify:** the full gate, E2E, and a scripted browser walkthrough of the whole journey.
- **Non-goals:** do not tick §14.1. It stays amber until a fixture with `"origin": "client"` passes.
- **Size:** ~1 day.

---

## 5. What CECODES sees, week by week

They asked for a weekly plan and weekly progress meetings.

| Phase | What they can see and click |
| --- | --- |
| P0 | Nothing visible. Say it plainly: "we made our tests trustworthy before building on them" |
| P1 | The round-2 memo, matching the code exactly |
| **P2** | **"Who entered this" on every value, and their colleagues can have real accounts.** The most visible answer to something they asked for |
| P3 | A PDF they can open, and diff against their own spreadsheet |
| P4 | A gas breakdown, plus the honest news about Scope 3 coverage |
| P5a | Nothing visible; fewer sharp edges |
| P6 | A §14 walkthrough with a clear amber list that is theirs to clear |

---

## 6. Verification, non-negotiable

```bash
bun run typecheck && bun run lint && bun run test && bun run build
bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
  # must print "This is an empty migration."
bun run test:e2e   # for anything with a UI surface
# then drive the real flow in a browser
```

**Static green is not evidence.** Paid for twice already: the year floor (green everywhere, 7 E2E
specs red) and the E2E suite itself (documented "green" while 6 specs failed).

Constraints every phase respects: totals in tonnes; `Decimal`/NUMERIC never Float; Decimals cross the
RSC boundary as strings; every Server Action re-validates with `.strict()` Zod and re-authorizes via
`company-scope.ts` (**RLS is inert and isolates nothing**); check the `{ count }` from
`updateMany`/`deleteMany`; names and units come from the factor library; Spanish UI with an English
toggle, all copy in `src/messages/`; **no em dashes** (there is a test).

**ONE shared Supabase database.** Never `migrate reset`, never `TRUNCATE`, never the Prisma MCP
reset tool. `prisma migrate dev` does not work here; migrations are hand-authored per §7.

---

## 7. What will still NOT be done when every phase is green

This list is the point of the plan. None of it is a gap in the build.

1. **§14.1 Excel parity.** Blocked on the workbook. The harness is built and waiting; it either
   passes or names the exact row that differs. Until then the calculation engine is unverified
   against CECODES, and we will not say otherwise.
2. **Scope 2 for 2025.** No factor exists anywhere. The year floor they asked for stays unapplied
   because applying it would leave **no year at all** in which electricity computes.
3. **The CH4 rule they chose.** Unimplementable until they mark which categories are combustibles.
4. **Grid factor values.** Both disputed numbers are in their own workbook, on two sheets.
5. **Meta.** Now buildable (percentage, company-wide total, first-year baseline). The one thing
   still to confirm is company-wide vs per-Sede, and only because the migration is a one-way door.
6. **Combined uncertainty.** Only a per-element list ships. A combined figure needs a method nobody
   has chosen and their Excel cannot supply.
7. **Spend-based purchases.** The FX rate is answered (per-year, year-average TRM), but the path is
   still held behind the unit error (A3), deliberately.
8. **Seven Scope 3 categories** (C8, C10-C15). Formally deferred by CECODES, recorded in the sign-off.
9. **Read-only auditor role.** Deferred by CECODES to a later version.
10. **Retroactive attribution.** Data entered before P2 can never be attributed. Physics, not policy.

**The critical path to acceptance is item 0, and it has been item 0 since the first memo.** Everything
else here is us removing our own excuses, so that when the workbook lands the only question left is
whether the numbers match.

---

## 8. Assumptions

Stated rather than asked. Each is cheap to correct except where noted.

- **Nullable name/phone/position.** Required would break `/register` and the fixtures. Fields
  confirmed by CECODES 2026-07-18: name, phone, email (exists), position _(cargo)_.
- **Per-person accounts beat a typed name box.** Their words say "specify who they are"; their goal
  says traceability. Self-reported identity is forgeable and skippable. **Expensive if wrong:** it
  changes P2's shape.
- **Meta is company-wide, not per-Sede.** "General total goal" and their "2025 total emissions"
  example both point this way. **Expensive if wrong:** company-wide is a table replacement, per-Sede
  is an ALTER. Build company-wide, confirm the axis before applying the migration.
- **Meta baseline is the fixed first reported year**, not the rolling prior year. Their "meta is
  established regarding this first year" reads this way. Cheap to correct.
- **FX rate is the year-average TRM.** CECODES said "year average rate". The rate mechanism is
  specified, but the spend path stays blocked on the A3 unit question regardless.
- **CECODES creates colleague accounts** for now. The admin path already exists and works; a
  join-request flow is a feature they have not asked for.
- **The 2025 sheet wins for grid factors**, matching their item-4 answer. **Not applied**, because it
  moves every Scope 2 total.
- **"Gas inventory" means tonnes CO2e per gas**, so the bars sum to the headline. If they mean native
  mass per gas, P4 is a different chart. **Expensive if wrong.**
- **The floor rises to 2025 the day the factor lands**, in one line, along with `e2e/fixture.ts`.
- **AR5 stays in the enum.** `gwpSet` tags a factor's published vintage, not the reporting year. A
  2025 report may legitimately cite an AR5-vintage factor. Removing it is a separate decision.
