# Implementation Guide

How this codebase is built, and why. Read this before writing code.

**This document explains the WHY and the traps.** It does not restate what the code already
says clearly. Where a rule exists, the reasoning behind it is recorded, because a rule
without a reason gets discarded by the next person who finds it inconvenient.

**Where the other documents live:**

| Document | Covers |
| --- | --- |
| [DESIGN.md](./DESIGN.md) | The design system: tokens, typography, layout, component choices |
| [AGENTS.md](./AGENTS.md) | The short version of the rules, loaded into every agent session |
| [docs/](./docs) | Product requirements and the weekly plan. Client facing, technology agnostic |
| [docs/CECODES - Tech Stack Decision.md](./docs/CECODES%20-%20Tech%20Stack%20Decision.md) | Why each technology was chosen |
| This file | How the system is actually implemented |

---

## 1. Getting started

Requirements: [bun](https://bun.sh), and access to the project's Supabase instance.

```bash
bun install          # also runs `prisma generate` via postinstall
cp .env.example .env.local
# fill in .env.local with the real Supabase values
bun run db:deploy    # apply migrations
bun run db:seed      # reference data + the single admin user
bun run dev
```

### Environment variables

All of them live in `.env.local`, which is git ignored. `.env.example` is tracked and holds
placeholders only. Never commit real values.

| Variable | Used by | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase clients | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase clients | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | Seed script, E2E harness | **Server only.** Bypasses all auth |
| `DATABASE_URL` | App runtime ([src/lib/prisma.ts](src/lib/prisma.ts)) | Pooled connection, port 6543 |
| `DIRECT_URL` | Prisma CLI ([prisma.config.ts](prisma.config.ts)) | Direct connection, port 5432 |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | [prisma/seed.ts](prisma/seed.ts) | Creates the single CECODES admin |
| `DEMO_SEED_ALLOWED`, `DEMO_PASSWORD` | [prisma/seed-demo.ts](prisma/seed-demo.ts) | **Local only.** The flag is the production brake |

If the database password contains characters that are reserved in a URI, such as `@` or
`:`, percent encode them inside `DATABASE_URL` and `DIRECT_URL`. An `@` becomes `%40`.

### Commands

| Command | What it does |
| --- | --- |
| `bun run dev` | Development server |
| `bun run build` | Production build. Runs the TypeScript check too |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | ESLint. The React Hooks rules are strict: `reactCompiler` is on |
| `bun run test` | Vitest unit tests |
| `bun run test:e2e` | Playwright. **Writes to the shared database.** See section 10 |
| `bun run db:deploy` | Apply pending migrations |
| `bun run db:seed` | Idempotent. Safe to run repeatedly |
| `bun run db:import-factors` | Import the factor library from the Excel. `--dry-run` previews. Idempotent |
| `bun run db:seed:demo` | Demo tenants. Refuses to run unless `DEMO_SEED_ALLOWED=true` |
| `bun run db:studio` | Prisma Studio |

> **Trap:** `bun run db:migrate` (`prisma migrate dev`) **does not work here.** Supabase's
> pooler exposes no shadow database. Use the migration workflow in section 7 instead.

---

## 2. Architecture at a glance

Next.js 16 App Router, full stack, deployed on Vercel. There is no separate API layer:
Server Components read, and Server Actions write.

```
Browser
  |
  |  (no Supabase client, ever. See rule 6.)
  v
src/proxy.ts ................ session refresh + authenticated/public gating
  |
  v
app/(app)/**/page.tsx ....... thin routes: guard, then render a feature screen
  |
  v
features/<x>/components ..... server screens fetch, client components render
features/<x>/hooks .......... React Hook Form + Zod, all side effects
features/<x>/actions ........ "use server", re-guard, re-validate, write
  |
  v
lib/auth/company-scope.ts ... the single authorization boundary
lib/prisma.ts ............... Prisma 7 with the pg driver adapter
  |
  v
Supabase Postgres
```

Two things are load bearing and easy to miss:

1. **Server Actions are public POST endpoints.** They never run a layout. A guard in a
   layout protects rendering, not data. Every action authorizes itself.
2. **Prisma connects as the database owner and therefore bypasses Row Level Security.**
   The RLS policies exist and are kept consistent, but they are inert at runtime. Read
   section 8 before touching anything that reads or writes tenant data.

---

## 3. Directory map

```
prisma/
  schema.prisma            Domain model. Comments here are normative
  migrations/              Hand authored SQL. See section 7
  seed.ts                  Reference data and the single admin. Idempotent

src/
  app/
    (auth)/                Login, register, forgot, reset. Redirects away if signed in
    (app)/                 Everything behind a session
      layout.tsx           SidebarProvider + AppSidebar + AppTopbar + skip link
      dashboard/           Company user home. Admins are redirected to /admin/companies
      data-entry/          Company user route
      facilities/          Company user route
      onboarding/          Company + first facility
      admin/
        layout.tsx         requireAdmin(). Rendering guard only
        companies/[companyId]/{dashboard,data-entry,facilities}
        users/  factors/
    auth/                  Supabase code exchange route handlers
    globals.css            The design tokens. Nothing else defines colour
    layout.tsx             Fonts, TooltipProvider, NextIntlClientProvider, Toaster
    page.tsx               Gateway: redirects to /dashboard or /login

  components/
    ui/                    shadcn primitives. Vendored, edit sparingly
    form/                  TextField, PasswordField. RHF compatible via forwardRef

  features/
    admin/                 Companies, users, factor library (CRUD + audit), onboarding wizard
    app-shell/             Sidebar, topbar, breadcrumbs, nav config
    auth/                  Sign in, sign up, password reset
    company/               The company page: profile + the Sedes section
    data-entry/            The core feature. See section 9
    dashboard/             Real computed numbers. See src/lib/calc/rollup.ts
    facilities/            Sedes CRUD. Rendered inside the company page, not its own route
    localization/          Language toggle
    onboarding/            First company + first sede, for a self-signed-up user
    preview/               Read-only spreadsheet of everything entered
    onboarding/            Company and first facility

  hooks/use-mobile.ts      matchMedia at 1024px, read via useSyncExternalStore
  i18n/                    next-intl request config. Cookie based, no URL prefix
  lib/
    auth/company-scope.ts  THE authorization boundary
    auth/server.ts         getUser, requireUser, getAppUser, requireAppUser, requireAdmin
    auth/safe-redirect.ts  Blocks open redirects in the auth callbacks
    calc/engine.ts         computeCo2eKg for a single source. Roll ups do not exist yet
    gwp.ts                 GWP tables, resolveGwpSet, kgToTonnes
    prisma.ts              The Prisma client
    supabase/              Server client and the proxy session refresh
  messages/{es,en}.json    All user facing copy
  proxy.ts                 Next 16's middleware. Named `proxy`, not `middleware`

e2e/                       Playwright: fixture tenant, setup, teardown, specs
```

---

## 4. Conventions

These are not stylistic preferences. Each one exists because its absence caused a real
problem.

1. **Routes are thin, features are thick.** A `page.tsx` guards and renders. It contains no
   queries, no layout, no business logic. This keeps a feature reusable from more than one
   route, which is exactly how an admin edits another company's data (section 5).

2. **Custom hooks own the logic; components own the markup.** No `useState` juggling or
   `fetch` inside JSX. A form component calls one hook and renders fields.

3. **Zod and React Hook Form everywhere.** Zod schemas are **factories that take a
   translator**, so validation messages are localized:

   ```ts
   export function facilityFormSchema(t: (key: string) => string) {
     return z.object({ name: z.string().trim().min(1, t("nameRequired")) });
   }
   export type FacilityFormValues = z.infer<ReturnType<typeof facilityFormSchema>>;
   ```

   The client resolver is a convenience. **The server re-validates with its own schema**
   and never trusts the client's.

4. **Never cap width with an arbitrary `max-w-*`.** Fill the space with grids and
   responsive padding.

5. **All code under `src/`.** The import alias `@/*` maps to `./src/*`.

6. **Never call Supabase from the browser.** There is no browser client in this repo, and
   there must not be one. Every Supabase call happens in a Server Action or a Server
   Component. This keeps the anon key off the critical path and makes every mutation a
   place where authorization can be enforced.

7. **Never use an em dash.** Anywhere. Use a period, a comma, a colon, or a hyphen. This
   applies to code comments, commit messages, and user facing copy.

Two more, specific to this domain:

8. **Every quantity and every factor is a Prisma `Decimal`**, which is a Postgres
   `NUMERIC`. Never `Int`, never `Float`, never a JavaScript `number`. The previous
   prototype stored integers and silently destroyed every decimal a company entered.

9. **Every total shown to a user is in tonnes (`t CO2e`).** Kilograms are an intermediate
   unit only. Convert with `kgToTonnes` before display.

And one interaction rule:

10. **Writes are optimistic.** The UI reflects the user's action immediately; the Server
    Action confirms in the background. On failure, roll back to the last state the server
    confirmed and surface the error using the matching row of the feedback table below.
    Never block the interface on a spinner while a routine save round-trips.

    The autosave store, [entry-store.ts](src/features/data-entry/lib/entry-store.ts), is
    the reference implementation: a typed value renders instantly, dirty cells flush in a
    batch, and a failed batch rolls each cell back to the last server-confirmed value.
    For mutations outside that store, reach for React 19's `useOptimistic` (or
    `useTransition` plus local rollback state) before inventing bespoke pending flags.
    Two parts are non-negotiable whatever the mechanism: keep the last confirmed value so
    rollback is possible, and surface the failure. Optimism without rollback is just
    lying about a failed save, which for an inventory tool is worse than a spinner.

### Async feedback: nothing may feel stuck

Every mutation tells the user it started, and then how it ended. There are exactly three
shapes, and a new flow must pick one rather than invent a fourth.

| Flow | In progress | Success | Failure |
| --- | --- | --- | --- |
| Form with a visible submit button | `<Button loading>` spinner, `aria-busy` | toast, then close or redirect | **inline** `serverError` text |
| Imperative row action (menu item, toggle, delete) | `toast.loading` | the same toast becomes `toast.success` | the same toast becomes `toast.error` |
| Autosave | the `SaveStatus` pill | the pill | rollback + `toast.error` |

- [use-toast-action.ts](src/hooks/use-toast-action.ts) is the second row. It wraps
  `useTransition`, opens a loading toast, and replaces it **by id** when the action settles.
  `router.refresh()` runs inside the transition, so a row never unmounts while its own confirm
  dialog is still spinning. It does not use `toast.promise`: our actions return
  `{ error?: string }` instead of throwing, and `toast.promise`'s reject mapping fights that.
- [confirm-action-dialog.tsx](src/components/feedback/confirm-action-dialog.tsx) is the only
  way to confirm a destructive action. It **stays open with a spinner until the action
  settles**. Radix's `AlertDialogAction` closes on click and cannot host a spinner, so the
  confirm here is a plain `<Button loading>` inside a controlled `AlertDialog`.
- **Autosave never toasts on success.** A toast every 700ms is noise; the pill is the feedback.
- A form's error goes **inline**, next to the field the user must fix. An imperative action has
  no form to anchor to, so it toasts. Do not mix the two.

### The UI language

Spanish (es-CO) is the default, with an English toggle. Domain terms stay Spanish even in
the English file: Alcance, Categoría, Sede, Planta, Huella de Carbono. All copy lives in
[src/messages/](src/messages/). Nothing is hardcoded.

---

## 5. Roles and routing

Two roles, in the Prisma `Role` enum: `COMPANY_USER` and `CECODES_ADMIN`. The role lives in
Postgres on `app_users`, **not in the Supabase JWT**. This is why the proxy cannot gate on
it: `src/proxy.ts` only distinguishes authenticated from public, and role checks happen in
the Node and RSC layer.

An admin has `companyId = null`. They own no company.

### How an admin works on behalf of a company

**Separate routes, one shared feature.**

| Route | Resolves `companyId` from |
| --- | --- |
| `/data-entry` | The session (`appUser.companyId`) |
| `/admin/companies/[companyId]/data-entry` | The URL, after `requireAdmin()` |

Both render the identical `<DataEntryScreen companyId={...} />`. The same is true of
`FacilitiesScreen` and `DashboardScreen`. There is no impersonation, no session forgery,
and no duplicated UI. Every write remains attributable to the admin's real user id.

This is the whole reason for rule 1. A screen that takes `companyId` as a prop, rather than
reading it from the session, works for both callers.

### The shell

One sidebar with role filtered groups, not one sidebar per role. Header, footer, topbar,
provider, and skip link are identical across roles; only the group list differs. When an
admin drills into a company, that company's workspace appears beneath "Empresas" as a
`SidebarMenuSub`.

The shell layout renders *above* `admin/companies/[companyId]/layout.tsx`, so it cannot
read that segment's params or context. The drilled company's name is resolved through a
cached server action, [get-company-name.ts](src/features/app-shell/actions/get-company-name.ts).

---

## 6. Data model

`Company -> Facility -> ReportingYear -> ActivityEntry`. Read the comments in
[prisma/schema.prisma](prisma/schema.prisma); they are normative.

### The rules the database now enforces

Earlier, these lived only in comments. They are now real constraints, because a comment
cannot stop a bug.

| Invariant | Enforced by |
| --- | --- |
| Scope 2 rows have a month 1..12; Scope 1 and 3 rows have `month IS NULL` | `activity_entries_month_scope_check` |
| A value is never negative | `activity_entries_value_nonneg_check` |
| An entry cannot claim company A while its reporting year belongs to company B | Composite FK `(reportingYearId, companyId)` |
| One row per source per month | `@@unique([reportingYearId, emissionFactorId, month])` |
| One annual row per source | Partial unique index `activity_entries_annual_source_key` |
| One facility name per company | `@@unique([companyId, name])` |
| One reporting year per facility per year | `@@unique([facilityId, year])` |

Two of these deserve explanation.

**The composite foreign key.** `activity_entries.companyId` is denormalized so that RLS
predicates and queries can filter on a single indexed column. It originally had no foreign
key, which meant a row could name one company while its parent reporting year named
another. That row would double count in the victim's totals. The composite FK, backed by
`ReportingYear.@@unique([id, companyId])`, makes the state unrepresentable rather than
merely unreached. Prisma expresses it as a multi field relation, so `migrate diff` reports
no drift.

**The partial unique index.** Postgres treats `NULL`s as distinct in a plain unique index,
so `@@unique([reportingYearId, emissionFactorId, month])` deduplicates the twelve Scope 2
month rows but does nothing at all for the annual rows, where `month IS NULL`. A partial
index predicated on `month IS NULL AND "emissionFactorId" IS NOT NULL` closes that gap.
The `emissionFactorId IS NOT NULL` predicate matters: rows orphaned by
`onDelete: SetNull` would otherwise collide with each other.

### `value` is nullable, and that is deliberate

```
value = NULL   ->  not reported yet
value = 0      ->  the company genuinely consumed nothing
```

Both contribute zero to the total. Only the second is an answer. Without this distinction,
Scope 2 cannot honestly report "8 de 12 meses", and a company that skipped a month looks
identical to one that shut the plant.

### Month semantics

Scope 2 (purchased electricity) is captured monthly: twelve rows per source. Scopes 1 and 3
are a single annual value: one row per source, `month = null`. This came from CECODES
directly and it is not negotiable.

### `CategoryApplicability`

The "¿Aplica?" toggle is reportable data, not UI state. The GHG Protocol requires excluded
categories to be disclosed with a justification, so "no aplica" has to survive into the
report. Absence of a row means the category applies, which is the column default.

A category can only be marked as not applicable while it has **no sources**. Silently
deleting a company's recorded consumption behind a switch would be the worst possible
failure mode for an inventory tool. The server refuses, and the UI disables the switch.

### `gwpSet` is pinned, never derived at read time

`resolveGwpSet(year)` returns AR5 through 2021 and AR6 afterwards. It is called exactly
once, when a `ReportingYear` is created, and the result is stored on the row. If the
boundary is ever revised, past years keep the vintage they were computed with. A derived
value would silently restate history.

---

## 7. Migrations

Supabase's pooler exposes no shadow database, so **`prisma migrate dev` cannot be used.**

To add a migration:

```bash
# 1. Edit prisma/schema.prisma.

# 2. See what SQL Prisma would generate against the live database.
bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script

# 3. Create prisma/migrations/<timestamp>_<name>/migration.sql by hand.
#    Paste the generated SQL, then add anything Prisma cannot express:
#    CHECK constraints, partial indexes, RLS policies, composite foreign keys.

# 4. Apply and regenerate.
bun run db:deploy
bun run db:generate

# 5. Confirm there is no drift. This must print "This is an empty migration."
bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Step 5 is not optional. If Prisma reports a constraint it wants to drop, the schema does not
own it, and the next person who runs a schema tool will lose it.

Never edit an applied migration. Prisma stores its checksum.

New tenant tables get an RLS policy block mirroring `activity_entries`, for consistency,
even though RLS is inert through Prisma.

---

## 8. The security model

> **Prisma connects as the Postgres owner and bypasses RLS.** No table has
> `FORCE ROW LEVEL SECURITY`, and [src/lib/prisma.ts](src/lib/prisma.ts) never issues
> `SET LOCAL role`. The policies in `20260709120320_rls_and_auth` are defence in depth for a
> future non-Prisma access path. **They protect nothing today.** Do not tell anyone that
> RLS isolates tenants in this application.

Isolation rests on two things: the constraints in section 6, and one file.

### `src/lib/auth/company-scope.ts`

This is the **only** place the admin versus company user decision is made. Every page and
every Server Action that touches tenant data calls it first.

```ts
resolveCompanyScope({ companyId })       // authorize a companyId from a route or an argument
resolveReportingYearScope(reportingYearId) // derive the company FROM the row, then authorize
resolveFacilityScope(facilityId)         // same, for facilities
```

Three rules it encodes:

- **An admin must always name an existing company.** Their own `companyId` is `null`, and
  if that ever reached `where: { companyId: scope.companyId }`, Prisma would emit
  `WHERE "companyId" IS NULL`, which matches nothing rather than everything. The mental
  model "null means no filter" is wrong. `resolveCompanyScope` throws instead.

- **A company user's own `companyId` wins.** Passing a different one throws `forbidden`.

- **For anything keyed on a child row, derive the company from the row.** Otherwise a user
  of company A can pair their own `companyId` with company B's `reportingYearId` and pass a
  naive `where: { companyId }` check.

Every failure maps to a single opaque error key, so a response never reveals whether a
resource exists.

### Writing a Server Action

```ts
"use server";

export async function saveSomething(input: { reportingYearId: string; value: string }) {
  const parsed = saveSomethingInput.safeParse(input);   // 1. re-validate. .strict()
  if (!parsed.success) return { error: "generic" };

  try {
    const scope = await resolveReportingYearScope(parsed.data.reportingYearId); // 2. authorize

    // 3. updateMany returns { count: 0 } rather than throwing when nothing matches, so an
    //    unchecked count reports success on a cross tenant write.
    const result = await prisma.activityEntry.updateMany({
      where: { id: entryId, reportingYearId, companyId: scope.companyId },
      data: { value: parsed.data.value },
    });
    if (result.count !== 1) throw new ScopeError("forbidden");

    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };   // 4. one opaque key
  }
}
```

Four more rules:

- **Zod schemas use `.strict()`**, so an unknown key cannot ride into a `data` object.
- **The client never sends `scope`, `category`, `subcategory`, `element`, or `unit`.** The
  server derives all five from the chosen `EmissionFactor` and snapshots them onto the row.
  A client sending its own would let a wrong scope factor corrupt the month logic.
- **`requireAdmin()` in `admin/layout.tsx` is a rendering guard, not a security boundary.**
  Actions re-guard.
- Errors return **i18n keys**, never sentences. The client translates them.

The one automated proof of all this is
[company-scope.test.ts](src/lib/auth/__tests__/company-scope.test.ts). If you change the
authorization logic, that file must change with it.

---

## 9. The data entry feature

The core of the product. Everything else orbits it.

### Shape

A sticky context bar (Sede, Año, save status), tabs per Alcance, and collapsible category
sections. The user adds only the sources they actually have, from a searchable picker fed by
the factor library, so element names can never be misspelled. Scope 2 rows expand into a
twelve month grid.

Adding a source **eagerly creates its rows** with `value = null`: twelve for Scope 2, one
for Scopes 1 and 3. The rows are what record that the source belongs to the year, and they
make every later save a keyed update rather than an upsert, which removes the
create-or-update race entirely.

### Autosave

There is no Guardar button. A year of data is far too many fields to trust to one the user
might never press, and the previous prototype lost work exactly this way.

Every dirty cell is collected into a single batched flush behind a trailing debounce.
Typing schedules a flush in 700ms; a blur schedules one in 180ms, so tabbing across twelve
month fields coalesces into **one** request rather than twelve.

[entry-store.ts](src/features/data-entry/lib/entry-store.ts) is a framework free external
store, read through `useSyncExternalStore`. The stack has no state library and needs none.
Each cell subscribes to its own `entryId`, so a keystroke in Enero does not re-render the
other eleven months. The context bar subscribes to the aggregate save status.

Three behaviours worth knowing:

- **An invalid draft is displayed but never marked dirty.** Typing `12,` shows `12,` so the
  caret does not jump, but it cannot ride along in someone else's batch and take the whole
  transaction down.
- **A failed batch rolls each cell back to the last value the server confirmed**, and
  toasts. Last write wins across two browser tabs. That is a deliberate choice for a single
  editor tenant, not an oversight.
- **`flushNow()` drains the debounce before any action that makes the server read a cell.**
  Without it, "Copiar Enero a todos los meses" can run while Enero is still queued in the
  browser, and the server correctly reports an empty Enero. Add `flushFirst: true` to any
  new action with the same property.

### Decimal across the server boundary

Prisma returns `decimal.js` instances, which are **not serializable** to a Client Component.

```
Postgres NUMERIC(20,6)
  -> Prisma Decimal
  -> .toString()          in the server screen. NEVER Number()
  -> string               through the props, the store, the input, and back
  -> Server Action
  -> Prisma Decimal
```

`Number()` would reintroduce exactly the float rounding the old tool suffered from. React
Hook Form holds a `string`; never use `valueAsNumber` for a quantity.

Validation is a shared regex, `/^\d{1,14}(\.\d{1,6})?$/`, which encodes `Decimal(20,6)`:
non negative, at most six decimal places, at most fourteen integer digits. It rejects `-5`,
`1e400`, `Infinity`, `NaN`, and `abc` by construction. Postgres silently rounds a seventh
decimal but raises `22003` past fourteen integer digits, so both are caught before the
driver. A Colombian decimal comma normalizes to a dot.

### Missing grid electricity factor

`GridElectricityFactor` is seeded only for 2013, 2019, and 2021 through 2024. A company
reporting 2020 is legitimate. The year selector stays free form, and Scope 2 shows a non
blocking warning: consumption is recorded, and emissions compute once an admin loads the
factor. **Silently computing zero is the exact class of bug this tool exists to replace.**

### Snapshotted labels

`ActivityEntry` copies `scope`, `category`, `subcategory`, `element`, and `unit` from the
factor at entry time. The library is versioned and mutable: factors get renamed,
recategorized, and deactivated, and `emissionFactorId` can go `NULL` through
`onDelete: SetNull`. The snapshot means an entry always renders what the user entered it
against, and renders without a join.

---

## 10. Testing

### Unit tests, Vitest

```bash
bun run test
```

Node environment, no DOM. The targets are the pure modules and, above all, the
authorization matrix:

- `entry-value.test.ts`: the value schema. Negatives, seven decimals, `1e400`, fourteen
  versus fifteen integer digits, the decimal comma, `0` versus empty.
- `entry-store.test.ts`: dirty tracking, rollback, the invalid draft rule, `hydrate`.
- `shape-entries.test.ts`: month semantics, grouping, deactivated factors.
- `gwp.test.ts`: the 2021 and 2022 boundary, `kgToTonnes`.
- `rollup.test.ts` and `preview.test.ts`: the two worked examples from docs section 7.5, GWP
  selection, the decimal comma, and the honest failure states. Note these assert numbers
  re-derived **by hand**; they are not Excel parity. See section 12.
- `map-row.test.ts`: the importer's column mapping, including the grams versus kilograms rule.
- `factor-diff.test.ts`: the Decimal aware audit diff.
- `messages.test.ts`: es and en key parity.
- `conventions.test.ts`: the em dash ban, over the whole tree. It used to cover only the two
  message JSON files, which is exactly how four em dashes reached `src/features/preview/`.
- `company-scope.test.ts`: **the highest value file in the suite.** Admin with a valid id,
  a nonexistent id, and no id; company user with their own id, another company's id, and no
  company; a session with no profile row; and `resolveOnboardingScope`, which refuses a
  deactivated user who was never onboarded.

Still missing, and worth knowing: there is no `engine.test.ts` (the engine is only exercised
transitively), no test for any Server Action, and no cross-tenant test at the HTTP layer.

### End to end, Playwright

```bash
bun run test:e2e
```

> **This writes to the shared Supabase database.** There is one project and no local
> Postgres.

The harness provisions its own throwaway tenant: a company named `E2E <uuid>`, a facility,
and a dedicated Supabase auth user. Teardown purges the whole `E2E ` namespace, and setup
sweeps it first so a crashed run cannot leak. Nothing outside that namespace is ever
touched. `workers: 1`.

Two traps, both already hit:

- **Playwright transpiles as CommonJS**, and the generated Prisma client uses
  `import.meta`. The harness talks to Postgres through `pg` directly. Do not import Prisma
  into `e2e/`.
- **Deleting a Supabase auth user does not remove its `app_users` row.** The signup trigger
  fires only on `INSERT`, and `app_users.id` carries no foreign key to `auth.users`. Delete
  both, or orphan the row forever.

**Never** run `prisma migrate reset`, `TRUNCATE`, or the Prisma MCP `migrate-reset` tool
against this database.

### Before you claim it works

```bash
bun run typecheck && bun run lint && bun run test && bun run build
bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Then drive the real flow in a browser. Typecheck passing is not evidence that a feature
works, and the two most serious bugs found in the data entry iteration were invisible to
every static check: a `CHECK` constraint that evaluated to `NULL` instead of `FALSE`, and a
race between the autosave debounce and a server read.

---

## 11. Traps

A list of things that have already cost someone an hour.

**Postgres**

- A `CHECK` constraint rejects a row only when the predicate is `FALSE`. A predicate that
  evaluates to `NULL` **passes**. `(scope = 'SCOPE_2' AND month BETWEEN 1 AND 12) OR (...)`
  yields `NULL` for a Scope 2 row with no month, and the row is stored. Use a `CASE`
  expression, which always yields `TRUE` or `FALSE`.
- `NULL`s are distinct in a plain unique index. Deduplicating nullable columns needs a
  partial index.
- Postgres cannot drop a value from an enum. Recreate the type in a forward only migration.

**Prisma**

- `updateMany` and `deleteMany` return `{ count: 0 }`; they do not throw. Always check the
  count, or a cross tenant write returns HTTP 200.
- `where: { companyId: null }` matches rows whose column is null. It does not mean "any".
- `migrate dev` needs a shadow database. Supabase's pooler has none.
- Decimals are `decimal.js` instances and cannot cross the RSC boundary.

**Next.js 16**

- The file is `src/proxy.ts` and the export is `proxy`, not `middleware`.
- Server Actions never execute a layout. A layout guard is not a security boundary.
- `params` and `searchParams` are Promises. Await them.

**React 19 and the compiler**

- `reactCompiler: true` is set in [next.config.ts](next.config.ts), so the React Hooks lint
  rules are strict. They will reject `setState` called synchronously inside an effect, and
  reading `ref.current` during render. Both are real bugs, not lint noise. Use
  `useSyncExternalStore` for external state such as `matchMedia`, and the lazy
  `useState(() => ...)` initializer for a store.
- **The App Router calls `history.pushState` from inside a React insertion effect** while it
  commits a navigation. Scheduling a state update in that window throws "useInsertionEffect
  must not schedule updates" and corrupts the commit, which silently breaks the navigation.
  [navigation-progress.tsx](src/components/feedback/navigation-progress.tsx) patches
  `pushState` to drive the top loading bar, so it defers every `setState` to a
  `requestAnimationFrame`, never touching React state inside the patched call. Anything that
  hooks navigation the same way must do likewise.

**shadcn**

- The `ghost` button variant fills on `aria-expanded`, which suits a dropdown trigger and
  paints a stray bar across an open section header. Neutralize it with
  `aria-expanded:bg-transparent`.
- `useIsMobile` ships with a 768px breakpoint. Ours is 1024px, so the sidebar becomes a
  Sheet below `lg` rather than showing a cramped rail.
- `SidebarInset` renders a `<main>`. Do not nest another one inside it.

**i18n**

- ICU formats a bare number with grouping, so `{year}` renders `2.020`. Pass years as
  strings.
- Month names are explicit keys, not `Intl`. `es-CO` returns a lowercase `"enero"` and
  offers no short form.

---

## 12. What is not built yet

Named honestly, so nobody assumes otherwise.

> Corrected 2026-07-12. This section previously claimed the roll ups and the dashboard did not
> exist. They do. See [docs/COMPLETION_PLAN.md](docs/COMPLETION_PLAN.md) for the audited
> BUILT / PARTIAL / NOT BUILT inventory, every line of which cites a file.

**Built since this section was last written:** [rollup.ts](src/lib/calc/rollup.ts) rolls a year up
to category, scope and company total, and the whole of [dashboard](src/features/dashboard/) renders
real computed numbers from it. Also built: the factor library with its audit trail, the
[preview](src/features/preview/) spreadsheet, and the admin onboarding wizard.

Genuinely not built:

- **Excel parity**, which is the project's actual acceptance test (docs section 14.1). It is not
  merely untested, it is currently **untestable**: `docs/reference/` holds the factor library
  workbook only. There is no filled in sample company spreadsheet with totals to compare against.
  Obtaining one is item 0 of [docs/CLIENT_DECISION_MEMO.md](docs/CLIENT_DECISION_MEMO.md).
- ~~**Reports**, PDF and Excel export.~~ **BUILT.** Excel/CSV (`exceljs`, `build-workbook.ts`) and
  PDF (`@react-pdf/renderer`, `build-pdf.tsx`) all ship through `src/app/api/reports/export/route.ts`.
  The PDF adds a per-element uncertainty list, per CECODES's decision to disclose uncertainty in the
  report rather than on the dashboard.
- **Roll up below category.** `rollupYear` stops at category; docs section 7.4 asks for element and
  subcategory too. `RollupEntry` does not carry the fields.
- **Per gas breakdown, uncertainty, spend based COP/USD, and unit conversions.** The columns exist
  in the schema and are admin editable; nothing reads them.
- **`ResultSnapshot`.** The model exists and nothing writes it. The dashboard recomputes per
  request, so results are always fresh and never reproducible.
- **RLS through Prisma.** Documented as inert. Making it real means a non owner role,
  `SET LOCAL role`, per transaction JWT claims, and `FORCE ROW LEVEL SECURITY`. It is a
  large change and is not required while `resolveCompanyScope` holds.

> The preview is **display only** and says so on screen. It parses to `number` because nothing it
> computes is ever stored. Do not copy that pattern into a persisted engine.

### Open questions the code deliberately leaves open

- **Five grid electricity factors disagree** between the Excel and the seeded values (2019,
  2021, 2022, 2023, 2024). The importer **reports and never overwrites**; a human resolves each
  one in the admin grid tab. Eleven further years (2008 to 2018, 2020) exist only in the Excel.
- **Seven Scope 3 categories are empty in the Excel** (C8, C10 to C15). They use methods
  CECODES has not supplied, so the importer skips them by name and lists them. Requirements 12.8.
- **`gwpSet` is left NULL on every imported factor.** The sheet does not state a vintage per
  row, and guessing one would silently pick a CH4 GWP. Explicit beats implied.
- **Spend based factors** land in `co2eFactor` with unit `USD`. `co2eFactorCop` and
  `co2eFactorUsd` stay reserved until CECODES answers the currency question, docs 12.4.
- **Per scope Meta** ships behind [FEATURE_SCOPE_TARGETS](src/lib/feature-flags.ts). CECODES
  said "almost certainly yes" but has not confirmed. Flipping the flag is the whole revert.

### The Excel's kilogram columns, and why we read them

The 2025 sheet gives CH4 and N2O twice: a grams column and a kilograms column beside it. The
kilograms column is usually a **cached Excel formula result** carrying float noise
(`0.026622399999999997`), so where the grams column exists it is authoritative and the
importer divides it by 1000 in `Decimal`.

But the grams column is **not always populated**: 288 CH4 rows and 152 N2O rows carry a value
only in the kilograms column (rice cultivation, fugitive gas leaks, coal mine seepage), and no
row has grams without kilograms. Refusing to read that column drops those factors silently,
which is the exact class of bug this tool exists to replace. So
[perGasKilograms](src/lib/factor-import/map-row.ts) prefers grams, falls back to kilograms, and
quantizes either way to the column's scale so a re-import compares equal instead of "changing".

Two smaller, deliberate deferrals:

- **Category ordering** follows the factor library alphabetically, so Alcance 1 reads
  "Emisiones Fugitivas, Fuentes Fijas, Fuentes Móviles" rather than the Excel's order. This
  needs an ordering column, which belongs with the confirmed dataset.
- **`ActivityEntry` does not snapshot `biogenic`.** Reproducibility is anchored by
  `ResultSnapshot.factorVersionId` instead.
