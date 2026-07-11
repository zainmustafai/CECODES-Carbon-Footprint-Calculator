# CECODES · Huella de Carbono

Corporate greenhouse-gas **carbon-footprint calculator + visualization dashboard** for CECODES.
Companies self-register, enter activity data across the three GHG-Protocol scopes (Alcance 1/2/3),
and the tool computes emissions (t CO₂e), reproducing CECODES's Excel tool, and visualizes them.

> **Before writing code, read [IMPLEMENTATION.md](./IMPLEMENTATION.md).** It covers the
> architecture, the conventions, the security model, and the traps.
> [DESIGN.md](./DESIGN.md) is the design system.
>
> **Product docs live in [`/docs`](./docs).** Start with the requirements and the weekly plan.
> This README covers the code/setup only.

## Tech stack

| Layer | Choice |
|---|---|
| App | **Next.js 16** (App Router, full-stack) · **React 19** |
| Styling / UI | **Tailwind CSS v4** · **shadcn/ui** (Radix UI) |
| Charts | **Recharts** (via shadcn `chart`) |
| Database | **Supabase Postgres** |
| Auth & isolation | **Supabase Auth + Row-Level Security** |
| ORM | **Prisma 7** (pg driver adapter) |
| Reports | **exceljs** + **@react-pdf/renderer** |
| i18n | **next-intl** (UI in Spanish, es-CO) |
| Runtime/PM | **bun** · deploy on **Vercel** |

See [`docs/CECODES - Tech Stack Decision.md`](./docs/CECODES%20-%20Tech%20Stack%20Decision.md) for the rationale
and the **Prisma + RLS integration note** (validate in Phase 1).

## Getting started

```bash
bun install                 # installs deps and runs `prisma generate`
# put your Supabase values in .env.local (or .env): NEXT_PUBLIC_SUPABASE_*, DATABASE_URL, DIRECT_URL
bun run db:deploy           # apply migrations to Supabase (no shadow DB needed)
bun run db:seed             # starter reference data (grid factors + factor-library versions + admin)
bun run db:import-factors   # load CECODES's full factor library from the Excel
bun run dev                 # http://localhost:3000
```

### Scripts

| Command | Does |
|---|---|
| `bun run dev` | Start the dev server |
| `bun run build` / `bun run start` | Production build / serve |
| `bun run lint` / `bun run typecheck` | ESLint / TypeScript check |
| `bun run test` / `bun run test:e2e` | Vitest unit tests / Playwright end to end |
| `bun run db:migrate` | Prisma migrate (dev) against `DIRECT_URL`. Unused: see the migrations note |
| `bun run db:deploy` | Apply migrations (prod) |
| `bun run db:studio` | Prisma Studio |
| `bun run db:seed` | Seed starter reference data and the single CECODES admin |
| `bun run db:import-factors` | Import the full emission-factor library from `docs/reference/*.xlsx`. Add `--dry-run` to preview |
| `bun run db:seed:demo` | Seed the demo companies. Guarded, see below |
| `bun run db:generate` | Regenerate the Prisma client |

### Demo data

`bun run db:seed:demo` creates two demo tenants for manual QA and for showing the tool to
CECODES. It is deliberately NOT part of `db:seed`.

| Account | Company | What it exercises |
|---|---|---|
| `demo1@demo.cecodes.invalid` | Demo Alimentos del Valle | Two sedes, reporting years 2023 and 2024, data across all three alcances. 2024 electricity is reported for 8 of 12 months, so the "8 de 12 meses" state is real |
| `demo2@demo.cecodes.invalid` | Demo Empresa Vacia | No sedes: every empty state in the product |

Both sign in with the value of `DEMO_PASSWORD` from `.env.local`.

> **There is one shared Supabase database.** `DEMO_SEED_ALLOWED=true` is the only thing that
> stops this script from writing demo companies into production. Keep it in `.env.local` and
> never set it in a deployed environment. The script refuses to run without it.

> **Migrations:** the Supabase pooler has no shadow database, so `prisma migrate dev` isn't used.
> To add one: edit `prisma/schema.prisma`, then generate SQL with
> `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script`
> into a new `prisma/migrations/<timestamp>_<name>/migration.sql`, then `bun run db:deploy`.
> RLS policies, tenant helpers, and the `auth.users` sync trigger live in the `*_rls_and_auth` migration.

## Project structure

```
app/                     Next.js routes (UI + server route handlers / actions)
components/ui/           shadcn/ui components (incl. chart = Recharts)
lib/
  prisma.ts              Prisma client singleton (pg adapter)
  gwp.ts                 GWP (AR5/AR6) constants + year → GWP-set helper
  calc/engine.ts         Calculation engine (stub → build to Excel parity)
  supabase/              Supabase server / client / middleware helpers
  generated/prisma/      Generated Prisma client (git-ignored)
prisma/schema.prisma     Domain model (Decimals everywhere; per-gas factors; versioned library)
middleware.ts            Refreshes the Supabase session per request
docs/                    Product requirements, weekly plan, tech-stack decision, Excel reference
reference/               Legacy prototypes (kept for reference, not built)
```

## Environment

Copy `.env.example` → `.env` and fill in: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` (pooled, runtime), `DIRECT_URL` (direct, migrations).
