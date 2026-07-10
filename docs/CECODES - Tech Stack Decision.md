# CECODES Carbon Footprint Tool - Tech Stack Decision (ADR)

**Status:** ✅ Decided / Locked - 2026-07-09
**Audience:** development team (internal). *This is intentionally **not** part of the client-facing requirements doc, which stays technology-agnostic.*
**Related:** `CECODES Carbon Footprint Tool - Requirements.md` (v1.1), `CECODES Carbon Footprint Tool - Weekly Plan.md`

---

## Context

We are building the CECODES carbon-footprint calculator + dashboard: a **multi-company self-service** web app with a calculation engine (full Excel parity), an admin-maintainable emission-factor library, a dashboard, and reports. The build must fix known defects of the old prototype (integers instead of decimals, no real auth, no data isolation, no calculation).

## Decision

| Layer | Choice |
|---|---|
| **Application** | **Next.js (App Router), full-stack** - React UI + server route handlers / server actions (no separate API service) |
| **Hosting** | **Vercel** (static/SSR + serverless functions) |
| **Database** | **Supabase Postgres** |
| **Auth & isolation** | **Supabase Auth + Row-Level Security (RLS)** |
| **ORM / migrations** | **Prisma** |
| **Styling** | **Tailwind CSS** (carried over from the prototype) |
| **Charts** | **Recharts** (swappable if a chart type needs more) |
| **Reports** | **exceljs** (Excel/CSV) + a PDF renderer *(library TBD - see open items)* |
| **Calculation engine** | A **pure TypeScript module** in the Next.js server, covered by **parity unit tests** against the Excel |
| **Language/UI** | **Spanish (es-CO)** UI from day one (via an i18n layer, e.g. next-intl) |

## Why this fits the requirements

- **Exact decimals** *(client requirement)* → Postgres `NUMERIC`/`DECIMAL` via Prisma. Directly fixes the old prototype's integer-truncation bug.
- **Strict per-company data isolation** *(Requirements §5)* → **Supabase RLS** enforces isolation **in the database itself**, so a company physically cannot read another company's rows - a stronger guarantee than app-code scoping alone.
- **Multi-company accounts + CECODES admin role** *(Requirements §2)* → Supabase Auth (email/password, verification, password reset) + a `role` claim (`company_user` / `cecodes_admin`).
- **Calculation engine with parity** *(Requirements §7, §14)* → a deterministic, unit-tested TypeScript module makes "reproduce the Excel's totals" a testable acceptance gate.
- **Factor library + versioning** *(Requirements §8)* → relational Postgres schema with a version-history table.
- **Dashboard + reports** *(Requirements §9, §10)* → Recharts for visualization; exceljs + PDF for export.
- **Single deploy target** → one Next.js app on Vercel keeps ops simple for a small team.

## Architecture at a glance

```
Browser (React, Tailwind, Recharts, Spanish UI)
        │  (Supabase session cookie)
        ▼
Next.js server (route handlers / server actions on Vercel)
   ├── Auth: Supabase Auth session (via @supabase/ssr)
   ├── Calculation engine (pure TS module, unit-tested)
   ├── Data access: Prisma  ──────────────►  Supabase Postgres
   └── Reports: exceljs + PDF renderer            (RLS enforced)
```

Domain model (to be built on Prisma schema):
```
Company ──< Facility ──< ReportingYear ──< ActivityEntry (value NUMERIC, unit, month?/annual)
                                          └─< ScopeTarget (Meta, if confirmed)
EmissionFactor (scope, category, subcategory, element, per-gas factors NUMERIC,
                unit, source, gwpSet, biogenicFlag, uncertainty, effectiveYear)
EmissionFactorVersion (version, date, preparedBy, reviewedBy, authorizedBy, changes)
User (Supabase auth) ── membership/role ── Company
```

## ⚠️ Key integration note: Prisma + Supabase RLS

Prisma and Supabase RLS need deliberate wiring - **validate this in Phase 1 before building on it**:

- Supabase RLS policies key off the request's JWT (`auth.uid()`, role `authenticated`). **`supabase-js` passes that JWT automatically; Prisma does not by default** - Prisma connects with its own DB role, so naive Prisma queries would run **outside** the RLS user context.
- **Chosen approach:** all DB access goes through the **Next.js server**; for tenant-scoped queries, run Prisma inside a transaction that sets the user context first - `SET LOCAL role authenticated; SET LOCAL request.jwt.claims = '{…}';` - (wrap in a small request-scoped Prisma helper / client extension) so **RLS is enforced even through Prisma**.
- **Belt-and-suspenders:** also scope every tenant query explicitly by `companyId` in server code. RLS is the DB-level backstop; explicit scoping is the app-level primary.
- Use Prisma's **direct** connection for migrations and Supabase's **pooled** connection (Supavisor) for serverless runtime.

*(If wiring RLS through Prisma proves too fiddly, the fallback is: use `supabase-js` for tenant reads/writes (RLS automatic) and keep Prisma for schema/migrations + admin/factor-library operations. Decide during the Phase 1 spike.)*

## What we are deliberately NOT using (and why)

- **Separate NestJS backend** - folded into Next.js full-stack per the decision. `nest-auth-backend` is kept as a **reference** for auth/Prisma patterns, not deployed.
- **better-auth** - superseded by Supabase Auth (chosen for RLS cohesion). Its org/roles ideas can still inform our membership model.
- **MySQL + Sequelize** (old prototype) - replaced by Postgres + Prisma (decimals, relations, migrations, type safety).

## Open implementation items (small, non-blocking)

1. **PDF library** - pick among `@react-pdf/renderer` (JSX-defined PDFs), `pdf-lib`, or headless-Chrome/Puppeteer (heavier on Vercel). Lean: `@react-pdf/renderer`.
2. **i18n library** - confirm `next-intl` (or equivalent) for the Spanish UI.
3. **Charts** - confirm Recharts covers all dashboard needs (donut, bar, line, YoY, target-vs-actual); consider ECharts only if a gap appears.
4. **RLS-through-Prisma spike** - the Phase-1 task above; decide primary vs fallback.

---

*Locked as the baseline. Changes to this stack should be recorded as a new dated entry here.*
