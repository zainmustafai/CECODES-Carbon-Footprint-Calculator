# CECODES: Maximum-Completion Prompt (v2)

> Paste everything below the line into a fresh Claude Code session at the repo root. It is
> self-contained and assumes no memory of prior sessions. It supersedes `COMPLETION_PROMPT.md`
> (round 1) and is built on the client's answers of 2026-07-17 and 2026-07-18.

---

# MISSION

Take the CECODES Huella de Carbono app as far toward done as it can honestly go **in one push**,
and ship incrementally: every green slice is committed and pushed, not held to the end. This is a
real product for a paying client, not an exercise.

# What "MAXIMUM complete" means, and its hard ceiling

"100% of Requirements §14" is **not reachable today, and you must not pretend it is.** §14.1 (Excel
parity) is *the* acceptance test: the tool must reproduce the client's Excel CO2e totals for sample
companies. It is blocked on one file only CECODES can send: a **filled-in workbook** with a company's
activity data *and* the totals their spreadsheet produced. The only workbook in `docs/reference/` is
the **factor library** (factors + change log, no company data, no totals). Parity is therefore not
merely untested, it is **untestable** right now.

So plan and work against this two-part definition, and state which part every commit serves:

- **DONE-A (we control):** every path that does not depend on a missing client input is built,
  tested, and driven in a real browser.
- **DONE-B (they control):** every client-blocked item has (1) a landed, documented default, (2) a
  single named switch point in the code, (3) a test that fails if someone flips it without the
  missing input, and (4) a one-line cost-to-apply once the answer lands.

"Maximum complete" = all of DONE-A shipped, and all of DONE-B quarantined so the day an answer
arrives, applying it is minutes, not weeks. **Being honest about the ceiling is part of the
deliverable.** Read `docs/COMPLETION_PLAN_V2.md` first: it is the plan of record, phase by phase.

---

# ABSOLUTE RULES (violating any of these fails the task)

1. **Never invent a factor, rate, GWP rule, or grid value to unblock a phase.** A missing input
   surfaces as an explicit UI warning, never a silent zero and never a plausible guess. A fabricated
   number that looks reasonable is undetectable downstream and corrupts the acceptance test.
2. **Never weaken a test to make it pass.** If a test is wrong, fix the test and say why in the
   commit. If the product is wrong, fix the product.
3. **Static green is not evidence.** `typecheck` + `lint` + `test` + `build` passing tells you
   nothing about the UI. This has been paid for twice: the 2025 year floor passed all static checks
   and broke 7 E2E specs; the E2E suite was called "green" while 6 specs failed. Drive the browser.
4. **ONE shared Supabase database.** Never `prisma migrate reset`, never `TRUNCATE`, never the
   Prisma MCP `migrate-reset` tool. E2E writes to it inside the `E2E ` / `@e2e.cecodes.invalid`
   namespace. `prisma migrate dev` does not work here (no shadow DB on the pooler); migrations are
   hand-authored SQL per `IMPLEMENTATION.md` §7.
5. **Do not delete the standing `it.todo` in `src/lib/calc/__tests__/parity.test.ts`.** Its job is
   to stop a green suite being mistaken for a passed acceptance test. It disappears only when a
   fixture with `"origin": "client"` lands.
6. **No em dashes anywhere.** There is a test enforcing it (`src/__tests__/conventions.test.ts`).
   Use commas, colons, or parentheses.
7. **Security model is not optional.** Every Server Action re-validates with a `.strict()` Zod
   schema and re-authorizes via `src/lib/auth/company-scope.ts`. RLS is inert through Prisma and
   isolates nothing. Check the `{ count }` from `updateMany`/`deleteMany` or a cross-tenant write
   reports success. Errors return opaque i18n keys, never sentences.
8. **Decimals.** Quantities and factors are Prisma `Decimal` (Postgres NUMERIC), never Int, Float,
   or a JS number. Decimals cross the RSC boundary as strings (`.toString()`, never `Number()`).
9. **Totals in tonnes.** kg is intermediate only; convert with `kgToTonnes`.
10. **Names and units come from the factor library** (exact Excel strings). Nothing hardcoded.
11. **Spanish UI (es-CO) with an English toggle.** All copy in `src/messages/{es,en}.json`, kept at
    key parity (there is a test). Domain terms stay Spanish (Alcance, Sede, Meta, Huella).
12. Read `AGENTS.md` and `IMPLEMENTATION.md` §8 before touching tenant data or a Server Action.

---

# GROUND TRUTH (verified this session, 2026-07-18)

- Branch `main`. Static gates green: `typecheck`, `lint`, **219 unit tests + 1 todo**, `build`.
- **The E2E suite is RED, and it is PRE-EXISTING, not yours.** 6 failures, documented in
  `COMPLETION_PROMPT.md:110-118` at commit `44f9af4`: `admin-companies`, `admin-factors`,
  `admin-users`, `data-entry`, `data-entry-edge`, `onboarding`. Suspect first: shared-session
  poisoning (Supabase `signOut()` revokes the refresh token globally), duplicate DOM ids, and dev
  RSC timing outrunning Playwright's default 5s expect timeout. Establish a warm-server baseline
  before diagnosing; a cold Turbopack compile can time out `auth.setup.ts` and send you chasing
  ghosts.

Facts you can rely on without re-deriving (each checked against the live DB or the files this
session):

| Fact | Consequence |
| --- | --- |
| Travel correction IS applied in the DB (9 rows, `correccion-km-1609`, 2026-07-12; `Carro particular` 0.477873 to 0.1845867) | Do NOT re-run the fix script; a second pass divides by 1.609² again |
| Zero mile-denominated units in the library | "km only" is already satisfied in data |
| **No 2025 grid electricity factor exists** anywhere (seed or either Excel sheet) | Scope 2 is uncomputable for the client's stated first year; blocks the 2025 year floor |
| Per-gas coverage: Scope 1 = 79%, Scope 2 = CO2-only, **Scope 3 = 6.2%** | A per-gas chart shows Scope 3 as one large unattributable wedge |
| CH4 rule swings **277 rows**; `FUEL_CATEGORIES` (`ch4-rule.ts:42`) covers only 85 of 389 CH4-bearing rows | Flipping the rule on a guess mis-classifies 277 rows |
| ActivityEntry write surface = **exactly 4 Server Actions**, all in `src/features/data-entry/actions/entries.ts`, all already behind `resolveReportingYearScope` | The audit-trail surface is bounded |
| `db:seed` no longer overwrites an admin's grid-factor resolution (fixed + proven this session) | Do not reintroduce the upsert-update on grid factors |

---

# CLIENT DECISIONS (both rounds). Requirements §12 has each answer quoted.

## Decided, build to these

| # | Decision | Status in code |
| --- | --- | --- |
| Biogenic CO2 | In the headline total AND disclosed separately | Already the behaviour |
| Units | Kilometres only, never miles | Already true; travel fix applied |
| Uncertainty | In the PDF report as a summary table, NOT on the dashboard | PDF unbuilt (P3) |
| Renewable energy | Reported separately, not folded into Scope 2 | Not built (small) |
| Deferred Scope 3 | C8, C10 to C15 out of parity, formally deferred | Importer already skips them |
| Auditor role | Not needed for v1, deferred | No work |
| **Meta** | **Percentage, company-wide TOTAL (not per-scope), fixed first-year baseline, never set in the baseline year** | Buildable (P5b); ONE axis to confirm, see below |
| **Traceability** | **Per-person accounts with name/phone/email/position + a per-entry audit trail (who/when/from/to)** | Not built (P2), the headline new feature |
| **FX rate** | Per-year, each year's **average TRM** | Mechanism specified; build BLOCKED on units (A3) |

## Blocked on CECODES. Quarantine, never guess.

| # | Missing input | What it blocks | Switch point |
| --- | --- | --- | --- |
| 0 | The filled-in workbook | §14.1 parity, the acceptance test | `parity.test.ts` fixture `"origin": "client"` |
| 2 | The 2025 grid factor | Scope 2 for 2025; the year floor | admin grid tab + `seed.ts` |
| 3 | Which categories are combustibles | The CH4 rule they chose | `ch4-rule.ts:34` + `FUEL_CATEGORIES:42` |
| 4 | Which grid sheet (2024 vs 2025) | Every Scope 2 total's provenance | admin resolution + `seed.ts` |
| 7 | Spend factor units (per COP or per USD?) | The whole spend-based path, and FX | `isPriceable` `rollup.ts:122` |
| Meta axis | Company-wide vs per-Sede | The Meta migration's shape only | `ScopeTarget` key |

**The Meta axis is the one cheap confirmation worth chasing before its migration lands:** company-wide
is a table replacement (a one-way door on the shared DB), per-Sede is a cheap ALTER. Build toward
company-wide (their "general total goal" and "2025 total emissions" wording point there) but do not
apply the migration until confirmed.

---

# FAILURE MODES ALREADY PAID FOR (do not repeat)

- **Flipping the CH4 rule because the client "answered" it.** They chose the fuel rule, but the
  library has no fuel column, so the rule is inexecutable until they enumerate categories. The
  constant stays `biogenic-flag`; there is a guard comment at `ch4-rule.ts` explaining why. Do not
  flip it.
- **Raising `MIN_REPORTING_YEAR` to 2025.** It looks correct (the client said so) but empties the
  set of years where Scope 2 computes: legal years become 2025 to 2027, grid factors exist only for
  2013 to 2024, intersection is empty. It stays 2000 until the 2025 factor lands. The guard test is
  in `reporting-year-schema.test.ts`.
- **Trusting static green.** See rule 3.
- **Windows `nul` files.** A subagent once ran `... 2>nul` in Git Bash, creating a real file named
  `nul` in the repo root; Tailwind v4 scans the root, reading a reserved device name panics
  Turbopack, and the dev server would not start. If E2E dies with a Turbopack CSS panic, check for a
  stray `nul` (`ls -la | grep nul`) and delete it.
- **Re-running `prisma/fix-travel-factors.ts`.** Already applied. A second run understates travel by
  2.59x.

---

# THE WORK, IN PHASE ORDER

Full detail (entry/exit/files/traps/non-goals/size) is in `docs/COMPLETION_PLAN_V2.md`. Summary:

## P0. Make the E2E suite genuinely green  [gates everything with a UI]

Run `bun run test:e2e`, read the output, diagnose each of the 6 to its real cause. Do not weaken
assertions. Exit: the suite exits 0 for real, output pasted into the commit, and
`SELECT count(*) FROM companies WHERE name LIKE 'E2E %'` returns 0. This is first because until it
is green, "verified in a browser" is a claim you cannot make.

## P1. Finish quarantining the blockers  [DONE-B, mostly landed]

Make the table above true and uniform: each blocked item has a default, a switch point, and a guard
test. Confirm `docs/CLIENT_DECISION_MEMO_ROUND2.md` matches the code exactly. Do not apply any
blocked answer.

## P2. Traceability: who did what  [the headline new feature]

Per-person accounts + a per-entry audit trail. Hand-authored migration (§7):

- `app_users`: add `name`, `phone`, `position` (all nullable TEXT). Confirmed fields:
  name/phone/email/position.
- new `activity_entry_changes`, mirroring `EmissionFactorChange` (`schema.prisma:281-294`):
  `changedById` (AppUser?, `onDelete: SetNull`) **plus** denormalized `changedByEmail` (the row must
  outlive the actor). Add an RLS policy block for consistency (inert, but §7 asks for it).
- wire attribution into all 4 write sites in `entries.ts`: `addSource`, `removeSource`,
  `saveEntryValues`, `copyJanuaryToAll`. The actor is already in hand via `resolveReportingYearScope`.
- `onboarding-actions.ts` (~:65-73): stop creating a duplicate Company for an unlinked user; return
  an opaque i18n error pointing them at CECODES. CECODES provisions colleague accounts for now.
- `user-schemas.ts` (`.strict()`, so it rejects the new fields until changed), `user-actions.ts`,
  `user-dialog.tsx`, `users-screen.tsx`, `src/messages/{es,en}.json`.

**Two traps that will silently hole the audit log:** `createMany` returns only `{ count }`, not ids,
so the 12 Scope-2 monthly rows need `createManyAndReturn` or per-row create to get audit rows;
`deleteMany` destroys the evidence, so read the doomed rows BEFORE deleting, in the same transaction.

Exit (all in a browser): two users of one company each edit a value and the history shows both edits
with who/when/from/to; deleting a user leaves their history readable; a colleague self-registering no
longer makes a duplicate company; admin sets name/phone/position and they show in the users list.
`e2e/onboarding.spec.ts` asserts the old duplicate-creating flow and must be rewritten, not weakened.

**Tell CECODES, do not bury:** every value entered before P2 ships is permanently unattributable.
The log starts the day it ships.

## P3. The PDF report (§10, §14.7)  [the last unbuilt requirement]

`src/features/reports/` already holds the Excel/CSV export; share `rollupYear` via `load-report.ts`
so the two exports cannot diverge. New Route Handler mirroring
`src/app/api/reports/export/route.ts:41` (call `resolveCompanyScope` first). `@react-pdf/renderer` is
a dependency imported nowhere. **Uncertainty slot:** build the per-element LIST (needs no maths).
Do NOT build a combined figure: no propagation method exists in the repo, the Excel has none to
copy, and coverage is partial (blanks read "no disponible", never dropped). Exit: a PDF downloads for
a real company-year, totals equal the dashboard to the last decimal, renders in ES and EN.

## P4. Per-gas breakdown (CO2 / CH4 / N2O)

The split is computed then discarded at `engine.ts:45-49`. Add `computeGasKg` and reimplement
`computeCo2eKg` as its sum, so scalar and split paths cannot diverge (do NOT add a second engine;
`rollup.ts:70-71` records that two-engines-that-disagree already happened here). The `co2eFactor`
short-circuit (`engine.ts:37-40`) gets a fourth "unattributed" bucket, never folded into CO2.
Precedent to copy: `biogenicCo2Tonnes` / `biogenicCo2Partial` at `rollup.ts:245-265`. Exit: per-gas
parts sum EXACTLY to the existing scalar for every fixture (this test is the whole safety argument).
**Show CECODES the 6.2% Scope-3 coverage before building the chart to it;** it is a data gap, and the
chart is honest but mostly one wedge.

## P5. Defects + the landed answers

- **P5a defects:** re-audit COMPLETION_PLAN v1's D-list; likely-live are composite-FK on 3 of 4
  tables, `db:migrate` still shipping `prisma migrate dev` (delete it), `notFound()` serving 200.
- **P5b Meta (buildable):** percentage, company-wide total, fixed first-year baseline. Drop the
  `scope` column, value becomes a percentage; rewrite `MetaVsReal` and `TargetKpi` from per-scope to
  one figure; existing absolute-tonne rows cannot be converted (drop or hand-migrate).
  `FEATURE_SCOPE_TARGETS` is already `true`. **Hold the migration apply for the company-vs-Sede
  confirmation.**
- **P5c spend-based COP/USD (BLOCKED on A3 units):** per-year year-average-TRM rate table modelled on
  `grid_electricity_factors`; a year with no rate refuses to price and surfaces it. Pin the Excel's
  ~3,743 for its own year. **Do not start before A3;** an FX rate over mis-united factors is wrong
  and plausible at once.

## P6. Acceptance dry-run

Walk the §14 checklist, mark each green/amber/red. Run the parity harness against the hand-computed
fixture and confirm it names the exact `(scope, category)` row on a deliberate mismatch. Do NOT tick
§14.1: it stays amber until a `"origin": "client"` fixture passes.

---

# VERIFICATION AND CADENCE

Before claiming any slice done:

```bash
bun run typecheck && bun run lint && bun run test && bun run build
bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
  # must print "This is an empty migration."
bun run test:e2e            # for anything with a UI surface; actually run it, actually read it
# then drive the real flow in a browser and confirm behaviour, not just compilation
```

Commit and push each green slice with a message that says what was verified and how (paste the E2E
tail for UI work). Branch off `main` for the work; do not skip hooks. If a hand-authored migration is
applied, `db:deploy` then re-run the migrate-diff and confirm it is empty (step 5 of §7 is not
optional). Confirm the `E2E ` namespace is clean after E2E runs.

---

# THE CEILING: what will NOT be done when every buildable phase is green, and why

Each is CECODES's decision, not a gap in the build:

1. **§14.1 Excel parity** (blocked on the workbook; the harness is built and waiting).
2. **Scope 2 for 2025** (no factor exists anywhere; the year floor stays unapplied for the same reason).
3. **The CH4 fuel rule** (inexecutable until they mark the combustible categories).
4. **Grid factor values** (both disputed numbers are in their own workbook, two sheets).
5. **Combined uncertainty** (only a per-element list ships; a combined figure needs a method nobody
   chose and the Excel cannot supply).
6. **Spend-based purchases** (held behind the A3 unit error, deliberately; the FX rate itself is
   decided).
7. **Meta company-vs-Sede** (one confirmation from a one-way migration).
8. **Retroactive attribution** (data entered before P2 can never be attributed; physics, not policy).
9. **Seven Scope 3 categories** and the **auditor role** (both formally deferred by CECODES).

**The critical path to acceptance is item 0, and it has been since the first memo.** Everything in
this prompt is us removing our own excuses, so that when the workbook lands the only open question is
whether the numbers match.

# FIRST ACTIONS

1. Read `AGENTS.md`, `docs/COMPLETION_PLAN_V2.md`, `IMPLEMENTATION.md` §7 and §8, and Requirements
   §12 and §14.
2. `bun install` if needed, then run the full static gate and `bun run test:e2e` to see reality.
3. Start P0. Do not build features on top of a red suite.
