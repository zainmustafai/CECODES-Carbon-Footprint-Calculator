# CECODES Carbon Footprint Tool - Tech Stack Decision (ADR)

**Status:** Current as of 2026-09-05. Supersedes the 2026-07-09 entry, kept below as history.
**Audience:** development team (internal). *This is intentionally **not** part of the client-facing requirements doc, which stays technology-agnostic.*
**Related:** `CECODES Carbon Footprint Tool - Requirements.md` (v1.1), `../AGENTS.md`, `../IMPLEMENTATION.md` §8

---

## Context

We are building the CECODES carbon-footprint calculator + dashboard: a **multi-company self-service** web app with a calculation engine (full Excel parity), an admin-maintainable emission-factor library, a dashboard, and reports. The build must fix known defects of the old prototype (integers instead of decimals, no real auth, no data isolation, no calculation).

## Decision (current)

| Layer | Choice |
|---|---|
| **Application** | **Next.js 16 (App Router), full-stack** - React 19 UI (compiler on) + Server Actions and route handlers, no separate API service |
| **Hosting** | **Vercel** for the hosted deployment; **Docker Compose** for self-hosting. One image serves either, with no build-time configuration inlined. |
| **Database** | **Postgres.** Currently hosted on Supabase, but nothing in the app is Supabase-specific: `DATABASE_URL` can name any Postgres. `docs/DATA-MIGRATION.md` is the runbook for moving. |
| **Auth** | **Self-hosted.** bcrypt password hashes in `app_users`, opaque random session tokens in `user_sessions`, stored as SHA-256. No third party is involved in authentication. |
| **Tenant isolation** | **`src/lib/auth/company-scope.ts`, in application code.** See the warning below. |
| **ORM / migrations** | **Prisma 7** with `@prisma/adapter-pg`. Migrations are **hand-authored SQL**. |
| **Mail** | **nodemailer**, with an SMTP or Resend transport, plus Mailpit for local development |
| **Styling** | **Tailwind v4** + shadcn/ui |
| **Charts** | **Recharts** |
| **Reports** | **exceljs** (Excel/CSV) + **@react-pdf/renderer** (PDF) |
| **Calculation engine** | A **pure TypeScript module**, covered by **parity unit tests** against the Excel |
| **Language/UI** | **Spanish (es-CO)** by default with an English toggle, via **next-intl** |
| **Package manager / tests** | **bun**; **Vitest** for unit tests, **Playwright** for E2E |

## The isolation warning, and it is the important part of this document

**Row-Level Security does not isolate tenants in this system.** The database carries 49 RLS
policies and they are **inert at runtime**, because Prisma connects as the database owner and the
owner bypasses every policy. A query that forgets to scope by company returns other companies'
rows. Nothing in the database stops it.

Isolation is therefore:

1. **`src/lib/auth/company-scope.ts`**, the single authorization boundary, which **every Server
   Action that touches tenant data calls first**, and
2. database constraints, which keep the relational shape honest but say nothing about who may read what.

Pages do not call it: they guard with `requireAppUser()` / `requireAdmin()` and pass a `companyId`
down. So `loadDashboard()` and `loadPreview()` take a `companyId` and query Prisma with no
authorization of their own. They are safe only because of their callers, and handing either one a
user-supplied id without a guard is a cross-tenant read.

Treat any claim that "the database enforces isolation" as false. The 2026-07-09 entry below made
exactly that claim, which is why it is marked superseded rather than deleted.

## Architecture at a glance

```
Browser (React 19, Tailwind v4, Recharts, Spanish UI)
        |  cookie: cecodes_session = 32 random bytes, base64url
        v
src/proxy.ts (route gate)
        v
getUser()  -  src/lib/auth/server.ts, the single seam where a cookie becomes an identity
        v
Next.js server (Server Actions / route handlers)
   |-- Authorization: company-scope.ts on every tenant-touching action
   |-- Calculation engine (pure TS module, unit-tested for Excel parity)
   |-- Data access: Prisma 7 + adapter-pg  ------>  Postgres
   |-- Mail: nodemailer (SMTP or Resend)
   +-- Reports: exceljs + @react-pdf/renderer
```

`role`, `companyId` and `active` are deliberately **not** in the session token. They live in
Postgres and are re-read on every request, which is what makes deactivating a user take effect on
their next request rather than at token expiry.

## What we are deliberately NOT using (and why)

- **Separate NestJS backend** - folded into Next.js full-stack. `nest-auth-backend` is kept as a **reference** for auth/Prisma patterns, not deployed.
- **Supabase Auth** - removed on 2026-09-04. Identity now lives in this repo's own schema, which is what makes the app portable to any Postgres host. Password hashes were migrated verbatim, so no user was forced to reset.
- **better-auth** - not adopted; the self-hosted session/password primitives in `src/lib/auth/` are small and already tested.
- **MySQL + Sequelize** (old prototype) - replaced by Postgres + Prisma (decimals, relations, migrations, type safety).
- **JWT session tokens** - rejected on purpose. A signed token carrying `role`/`active` would turn immediate deactivation into deactivation-at-expiry.
- **`cacheComponents` / PPR** - see the note in `next.config.ts`; it would force a restructure of the auth shell on every page.

---

## Superseded: original entry, 2026-07-09

> **Do not build on this section.** It is kept because the file's own rule is that stack changes are
> recorded as new dated entries, not silent edits. Two of its decisions were reversed:
>
> - **"Auth & isolation: Supabase Auth + Row-Level Security (RLS)"** and the claim that RLS means
>   "a company physically cannot read another company's rows". Supabase Auth was removed on
>   2026-09-04, and the RLS claim was never true in this deployment: Prisma connects as the owner
>   and bypasses policies. See the isolation warning above.
> - **The "RLS-through-Prisma spike"** (setting `SET LOCAL role authenticated` per transaction) was
>   never adopted. Explicit scoping through `company-scope.ts` became the primary and only
>   mechanism, not the "belt-and-suspenders" backstop the original entry described.
>
> The original open items are all now closed: the PDF library is `@react-pdf/renderer`, the i18n
> library is `next-intl`, and Recharts covered every dashboard need.

The original entry's remaining choices (Next.js full-stack on Vercel, Postgres, Prisma, Tailwind,
Recharts, exceljs, a pure-TypeScript parity-tested calculation engine, Spanish-first UI) were all
kept and are restated in the current table above.

---

*Changes to this stack should be recorded as a new dated entry here, superseding rather than
rewriting what came before.*
