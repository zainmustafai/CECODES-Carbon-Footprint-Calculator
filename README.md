# CECODES · Huella de Carbono

Corporate greenhouse-gas **carbon-footprint calculator + visualization dashboard** for CECODES.
Companies self-register, enter activity data across the three GHG-Protocol scopes (Alcance 1/2/3),
and the tool computes emissions (t CO₂e) — reproducing CECODES's Excel tool — and visualizes them.

> **Product docs live in [`/docs`](./docs).** Start with the requirements and the weekly plan.
> This README covers the code/setup only.

## Tech stack

| Layer | Choice |
|---|---|
| App | **Next.js 16** (App Router, full-stack) · **React 19** |
| Styling / UI | **Tailwind CSS v4** · **shadcn/ui** (Base UI) |
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
cp .env.example .env        # then fill in your Supabase values
bun run db:migrate          # create the schema in your Supabase DB (needs DIRECT_URL)
bun run dev                 # http://localhost:3000
```

### Scripts

| Command | Does |
|---|---|
| `bun run dev` | Start the dev server |
| `bun run build` / `bun run start` | Production build / serve |
| `bun run lint` / `bun run typecheck` | ESLint / TypeScript check |
| `bun run db:migrate` | Prisma migrate (dev) against `DIRECT_URL` |
| `bun run db:deploy` | Apply migrations (prod) |
| `bun run db:studio` | Prisma Studio |
| `bun run db:generate` | Regenerate the Prisma client |

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
