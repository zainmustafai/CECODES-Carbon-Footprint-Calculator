# CECODES: Completion Prompt

> **SUPERSEDED 2026-07-18 by [COMPLETION_PROMPT_V2.md](./COMPLETION_PROMPT_V2.md).** This round-1
> prompt predates the client's answers of 2026-07-17 and 2026-07-18. Its P0 baseline (the six red
> E2E specs) is still accurate and is cited by v2, but hand a fresh session the v2 prompt, which
> carries the client decisions, the traceability requirement, and the verified ground truth. Kept
> for the record.

> Paste everything below the line into a fresh Claude Code session at the repo root.
> It is written to be self-contained: it does not assume any memory of previous sessions.

---

# MISSION

Take the CECODES Huella de Carbono app from its current state to **delivery-ready**, in this
session. Ship to `main` incrementally: every green slice gets committed and pushed, not held to the
end.

# READ THIS FIRST: what "100% complete" can and cannot mean today

**100% of Requirements §14 is NOT achievable today, and you must not pretend otherwise.**

§14.1 (Excel parity) is *the* acceptance test: "for an agreed set of sample companies, the tool
reproduces the Excel's CO2e totals". It is blocked on a file only CECODES can send: a **filled-in
calculation workbook** containing a company's activity data *and* the totals their spreadsheet
produces from it. The only workbook in the repo (`docs/reference/CEC-PR-CTE-127 ...xlsx`) is the
**factor library**: factors and a change log, no company data, no totals. Parity is therefore not
merely untested, it is **untestable**.

The harness is already built and waiting: `src/lib/calc/__tests__/parity.test.ts` plus
`src/lib/calc/__tests__/fixtures/parity/README.md`. When the client's file arrives, transcribe it
into a fixture with `"origin": "client"` and the test either passes or names the exact
`(scope, category)` row that differs.

So for today, **"100% complete" means:**

- every item **not** blocked on CECODES is built, verified, and shipped, **and**
- every **blocked** item is explicitly quarantined, still visible, and running on a documented
  default.

**Therefore, do NOT:**

- claim §14.1 is met, or tick the parity boxes in the Definition of Done;
- invent, fabricate, or "reconstruct" a parity fixture and call it the client's;
- delete the standing `it.todo` in `parity.test.ts` to make the output tidy. Its entire job is to
  stop a green suite from being mistaken for a passed acceptance test. It disappears the day a
  fixture with `"origin": "client"` lands, and not before;
- guess at the values in the BLOCKED list below.

Being honest about the ceiling *is* part of the deliverable.

# GROUND TRUTH

- Branch: `main`. Latest commit: `44f9af4`.
- Gates as of that commit: `typecheck` green, `lint` green, **210 unit tests** green (+1 todo),
  `build` green. **The e2e suite is NOT fully green** (see P0).
- Read before planning:
  - `docs/COMPLETION_PLAN.md` - the audited BUILT / PARTIAL / NOT BUILT inventory and the numbered
    defect list (D1-D14). Every claim in it cites a file.
  - `docs/CLIENT_DECISION_MEMO.md` - the ten open client decisions and their defaults.
  - `AGENTS.md` - the non-negotiable rules.
  - `IMPLEMENTATION.md` §12 - what is genuinely not built. **This was stale and was corrected**; it
    is now accurate.

**Doc warning.** Several docs previously claimed the roll-ups and dashboard did not exist. They do.
Those claims were fixed, but the lesson stands: **if a doc says something is not built, verify it
against the code before planning around it.** Cite a file for every claim you make.

# NON-NEGOTIABLE CONSTRAINTS (from AGENTS.md)

1. **Excel parity is the acceptance test.** Do not "improve" a calculation in a way that makes it
   diverge from the Excel without recording why.
2. **Scope 2 is monthly; Scopes 1 and 3 are annual.** `ActivityEntry.month` is 1-12 for Scope 2,
   null otherwise. Enforced by a DB CHECK that lives only in migration SQL.
3. **Every user-facing total is in tonnes** (t CO2e). kg is intermediate only; convert with
   `kgToTonnes`.
4. **Quantities and factors are Prisma `Decimal`.** Never Int, Float, or a JS number in the storage
   path. Decimals cross the RSC boundary as **strings** (`.toString()`, never `Number()`). Float
   math is allowed **only** for display and only where already established (`rollup.ts`,
   `preview.ts`, the export) - never in anything persisted.
5. **Element names and units come from the factor library.** Nothing hardcoded.
6. **RLS is inert.** Prisma connects as the DB owner and bypasses every policy.
   `src/lib/auth/company-scope.ts` is the single authorization boundary. **Every Server Action and
   every Route Handler** authorizes there **first**, re-validates with its own `.strict()` Zod
   schema, and checks the `{ count }` on every `updateMany`/`deleteMany`.
7. **UI is Spanish (es-CO)** with an English toggle. All copy in `src/messages/`. Domain terms stay
   Spanish (Alcance, Sede, Meta, Huella de Carbono).
8. **No em dashes anywhere.** Enforced repo-wide by `src/__tests__/conventions.test.ts`.
9. **Migrations are hand-authored SQL.** `prisma migrate dev` does not work here (the Supabase
   pooler has no shadow DB) and its npm script was deliberately deleted. Follow IMPLEMENTATION.md §7.
10. **There is ONE shared Supabase database.** Never run `prisma migrate reset`, `TRUNCATE`, or the
    Prisma MCP `migrate-reset`. The e2e suite writes to it inside the `E2E ` / `@e2e.cecodes.invalid`
    namespaces; keep it that way.
11. Never cap width with an arbitrary `max-w-*`. Routes thin, features thick. Hooks own logic,
    components own markup.

# THE WORK, IN PRIORITY ORDER

## P0. Make the e2e suite genuinely green

**This is first because "green" is currently a claim, not a fact.** Run it and read the output:

```bash
bun run test:e2e
```

**Establish a baseline before you fix anything.** The numbers below come from the last *clean* full
run, not a fresh one: a later confirmation run died in `auth.setup.ts` with both logins timing out at
90s, which is environmental (cold Turbopack compile, or Supabase auth throttling after a day of
`admin.createUser` calls) rather than a product regression. If setup times out, re-run it: a warm dev
server logs in within seconds. Do not start diagnosing specs until setup is green, or you will chase
ghosts.

Last known good state: **~26 passing, ~6 failing**. The failures cluster in:

- `admin-companies.spec.ts` - "creates a company through the onboarding wizard"
- `admin-factors.spec.ts` - "creates a factor, edits it, and the change lands in its history"
- `admin-users.spec.ts` - "reactivates and then deletes the user"
- `data-entry.spec.ts` - "creates a reporting year, then records annual and monthly values"
- `data-entry-edge.spec.ts` - "adding a source locks the category's ¿Aplica? switch"
- `onboarding.spec.ts` - "completing company and first facility lands on the dashboard"

**Diagnose each one to its real cause. Do not weaken an assertion to make it pass.** If a test is
wrong, fix the test and say why in the commit. If the product is wrong, fix the product.

Three failures of this exact shape were already found and fixed today, and they are the pattern to
suspect first:

- **Shared-session poisoning.** `auth.spec.ts` logged out using the *shared* storage state.
  Supabase's `signOut()` revokes the refresh token **server-side and globally**, so every spec that
  ran afterwards loaded a dead session and got bounced to `/login`. They failed on assertions
  unrelated to their subject, and some passed **vacuously** (an isolation test asserting "the
  victim's name is not on this page" passes beautifully when the page is the login screen). Fixed by
  giving the logout test its own disposable user.
- **Duplicate DOM ids.** `TextField` derived its id from the field *name*, so two forms with a
  same-named field on one page produced two `id="name"`, and a `<label for>` bound to the wrong
  input. Fixed with `useId()` in `TextField`/`DecimalField`/`PasswordField`.
- **Timing.** `/company` now runs two queries and re-renders a heavier tree, so a `router.refresh()`
  in dev regularly outlasts Playwright's default 5s expect timeout. The write lands immediately; the
  RSC round trip is what is slow. Explicit timeouts, not blind retries.

**Acceptance:** `bun run test:e2e` exits 0, run for real, output pasted into the commit or the
summary. Afterwards confirm the namespace is clean:
`SELECT count(*) FROM companies WHERE name LIKE 'E2E %'` returns 0.

## P1. The PDF report (Requirements §10, §14.7) - the last unbuilt requirement

`@react-pdf/renderer` is already a dependency and is imported **nowhere**.

**Design decisions already made, do not re-litigate:**

- **Render numbers as tables, not charts.** The dashboard charts are Recharts: client-side SVG that
  will not render server-side. Fighting that with a headless browser is out of scope for v1.
- **Deliver as a Route Handler**, mirroring `src/app/api/reports/export/route.ts`. A Route Handler
  runs **no layout**, so `requireAppUser`/`requireAdmin` never fire for it: it is exactly as exposed
  as a Server Action. `resolveCompanyScope` must be its **first call**.
- **Reuse `loadReport()`** (`src/features/reports/lib/load-report.ts`). Do **not** re-implement any
  arithmetic. Every number must come from `rollupYear`, exactly as the Excel export does. This is the
  artifact the client diffs against their spreadsheet; if the report does its own maths, any shortcut
  in it reads to them as a calculation bug in the product.

**Contents required by §10:** company, facility, reporting year, the GWP set used, totals by scope
and by category, the main figures, and a methodology/sources note.

**Also required, and easy to forget:**

- **`CategoryApplicability` disclosures.** The GHG Protocol requires stating which categories the
  company declared out of scope. This data currently never reaches a report VM; it must.
- **The same honesty disclosures the Excel already carries**: `unpricedCount` (sources excluded from
  the totals, so the totals are incomplete), `missingGridFactor`, and the biogenic split
  (`biogenicTonnes` vs `biogenicCo2Tonnes` vs `biogenicCo2Partial`).
- **A reproducibility stamp.** Nothing writes `ResultSnapshot`; the numbers are computed live, so two
  PDFs of the same year can legitimately differ after an admin edits a factor. Print
  "calculado el {date} con biblioteca {version}" rather than implying permanence.

**Acceptance:** tests for the builder; the route authorization-tested like
`src/features/reports/lib/__tests__/export-route.test.ts`; and **generate a real PDF from the live
demo company and open it**. Static green is not evidence.

## P2. The remaining correctness defects (all documented in `docs/COMPLETION_PLAN.md`)

- **D6 - autosave can silently drop an edit.** `ContextBar.go()` calls `router.push` with no flush
  and `DataEntryProvider` is not keyed, so the unmount-flush never runs when the facility or year
  changes. The blur-flush usually wins the race, but it is a race. Fix: `flushNow()` before the push,
  or key the provider on `reportingYearId`.
- **D7 - `setFactorActive` writes a fabricated audit diff.** It builds the audit row from an
  *assumed* prior state (`factor-actions.ts`) instead of reading the row, so calling it twice with
  the same value records a flip that never happened. Worse: it writes a non-`IMPORTED` action, which
  permanently marks the factor human-edited so the importer will never update it again. The
  importer's own starter cleanup has the same bug.
- **D8 - renaming a factor spawns a duplicate on re-import.** Editing the natural key
  (`scope/category/subcategory/element/unit`) defeats the importer's `findFirst` match, so the next
  run creates a second row alongside the renamed one and both appear in the picker.
- **D9 - composite-FK protection applied to 1 table of 4.** Only `ActivityEntry` has it.
  `CategoryApplicability`, `ScopeTarget` and `ResultSnapshot` carry a denormalized `companyId` with
  no composite FK, so Postgres will accept a wrong `companyId` and the scoped `deleteMany` then
  silently matches nothing. Needs `@@unique([id, companyId])` on `Facility` and composite FKs on the
  three children. **Hand-authored SQL migration** per IMPLEMENTATION.md §7, then confirm the drift
  check prints an empty migration.
- **D13 - `notFound()` serves a 200, not a 404.** The `(app)` layout streams before the page throws,
  so the response is already committed. **Isolation still holds** (the user sees "Página no
  encontrada" and no admin content ever renders), so this is a status-code defect, not a breach. Fix
  by moving the admin guard into a layout or `src/proxy.ts` so the refusal happens before the shell
  renders.

## P3. Verification debt and hygiene

- **E2E coverage for what has no coverage:** the admin onboarding wizard, `/preview`, the
  consolidated `/company`, the export download, and the admin drill-down `/admin/companies/[id]/*`.
- **Component tests cannot run at all.** `vitest.config.ts` matches only `src/**/*.test.ts` with
  `environment: "node"`, so no `.tsx` test can ever execute.
- **The `en` locale is never rendered in CI.** Key parity is tested; runtime rendering is not. A
  missing `t()` or a wrong namespace surfaces as a raw key path and Spanish-only QA never sees it.
  One spec that flips the toggle and asserts no `/^[a-z]+\.[a-z]+\./` text on screen closes it.
- **No ICU placeholder-parity test** between es and en.
- 5 hardcoded user-facing strings outside `src/messages/`; 3 skeletons that do not match their
  screens (`/admin/factors`, `/admin/users`, `/admin/companies/new`); no `loading.tsx` for
  `/onboarding`; dead exports (`ScreenSkeleton`, the `companyName` prop on `AppSidebar`).
- Update `docs/COMPLETION_PLAN.md` as you close items. Leave the blocked ones standing.

# BLOCKED - do not attempt, do not fake, do not guess

These are in `docs/CLIENT_DECISION_MEMO.md` with recommended defaults. Work continues **around**
them on those defaults; they are the reason final acceptance cannot be declared today.

| Item | Status |
| --- | --- |
| **Memo 0 - the filled-in calculation workbook** | The only thing that cannot be defaulted. Gates §14.1 entirely. |
| Memo 1 - the CH4 GWP rule (fuel-vs-not, or the biogenic column) | The rule is **already switchable** (`src/lib/calc/ch4-rule.ts`), defaulting to the biogenic column. When the workbook arrives, run the fixture under both rules and let their numbers decide. Do not pick by opinion. |
| Memo 2 - is 2021 AR5 or AR6 | Their GWP sheet lists only AR6; `resolveGwpSet` currently says AR5 for 2021. Recommended default: AR6. **Do not change it unilaterally** - it moves every pre-2022 total. |
| Memo 5 - 5 disputed grid factors (2019, 2021-2024) | Blocks all Scope 2 parity. |
| Memo 7 - implausible spend factors (cement ~3,924 kg CO2e/USD) | **Deliberately escalated, not fixed.** Unlike the travel factors, the correct value cannot be derived. Guessing would be worse than asking. |
| Memo 9 - the 7 empty Scope 3 categories (C8, C10-C15) | Methods not supplied. Already formally deferred by §12.A8. |

**Already resolved, do not redo:** the Scope 3 travel factors (memo 6). All 9 were overstated by
1.609² (~2.59x) because the source workbook multiplied a per-mile factor by 1.609 where it should
have divided. Corrected via `prisma/fix-travel-factors.ts` (dry-run by default, idempotent, writes a
full audit trail). The correction reproduces their per-mile source values exactly
(`0.297 / 1.609 = 0.1845866998`, which is the stored value). Memo item 6 now only needs a
countersignature.

# VERIFICATION STANDARD

Before claiming **any** work done:

```bash
bun run typecheck && bun run lint && bun run test && bun run build
bun run test:e2e            # actually run it, actually read it
bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
                            # must print "This is an empty migration."
```

...and then **drive the real flow in a browser**.

**Static checks passing is not evidence a feature works.** Today the unit suite was green while the
e2e suite was red, two serious a11y violations were live in production code, and a `<label>` was
bound to the wrong input. "The tests pass" and "it works" are different sentences.

# TRAPS (each of these already cost real time)

- **Supabase `signOut()` revokes the refresh token globally.** Never log out a shared session in e2e.
- **Form field ids must be `useId()`, never the field name.** Duplicate DOM ids silently bind a label
  to the wrong control.
- **`notFound()` after the layout has streamed produces a 200.**
- **`rollupYear` EXCLUDES unpriced sources** and reports `unpricedCount`. Never reintroduce a
  fabricated `0`: an unpriced source is an unknown, not a measurement. The same rule governs the
  export ("not reported" stays an empty cell, never `0`).
- **The preview and the roll-up must never diverge.** They already did once. Both go through
  `computeCo2eKg`; anything that prices a source must too.
- **React Compiler is on**, so strict hooks lint findings are real bugs, not noise. No `setState` in
  an insertion effect (the App Router calls `history.pushState` inside one; `NavigationProgress`
  defers via `requestAnimationFrame` for exactly this reason). `useSyncExternalStore` snapshots must
  be primitives.
- **Next 16**: the middleware file is `src/proxy.ts` exporting `proxy`; `params`/`searchParams` are
  Promises.
- **A Postgres `CHECK` that evaluates to `NULL` passes**, and NULLs are distinct in unique indexes.
  See IMPLEMENTATION.md §11 before writing a constraint.
- **`updateMany`/`deleteMany` return `{ count }` instead of throwing.** An unchecked count is a
  silent cross-tenant write reporting success.
- The `.xlsx` importer must never read the sheet's cached kg formula columns (they carry float
  noise); grams are authoritative, divided in `Decimal`.

# SHIP DISCIPLINE

- Commit and push to `main` after **each** green slice. Do not batch.
- Conventional commits. The body explains **why**, not what: the diff already says what.
- If a change moves a displayed number, say so in the commit and in the summary to the user.

# DEFINITION OF DONE FOR TODAY

- [ ] `bun run test:e2e` exits 0, run for real, no assertion weakened to get there
- [ ] PDF report shipped: authorized at the boundary, reusing `loadReport`, carrying the
      applicability + incompleteness + biogenic disclosures, and **opened as a real file**
- [ ] D6, D7, D8, D9, D13 fixed, each with a test that fails without the fix
- [ ] `typecheck`, `lint`, unit, `build` all green; migration drift check empty
- [ ] `docs/COMPLETION_PLAN.md` updated to match reality
- [ ] Every BLOCKED item still visible, still defaulted, still unfaked
- [ ] `parity.test.ts` still carries its standing `todo`
- [ ] No em dashes; no unlabeled TODOs; `E2E ` namespace clean

# THE ONE THING THAT IS NOT CODE

**Send `docs/CLIENT_DECISION_MEMO.md` to CECODES.** Item 0 (the filled-in calculation workbook) is
the only item in this entire project that cannot be worked around, and it gates final acceptance.
Everything else has a safe default. If that memo has not gone out, no amount of engineering today
changes when this project can be *accepted*.

# HOW TO REPORT BACK

State plainly: what is done, what is verified (and *how* it was verified, not just that it passed),
what is still blocked and on whom, and what you had to change your mind about. If something failed,
show the output. If you skipped something, say so. Do not describe unverified work as working.
