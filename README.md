# CECODES · Huella de Carbono

Corporate greenhouse-gas **carbon-footprint calculator + visualization dashboard** for CECODES.
Member companies enter activity data across the three GHG-Protocol scopes (Alcance 1/2/3), the
tool computes emissions (t CO₂e) reproducing CECODES's Excel tool, visualizes them on a
dashboard, and exports them to Excel/CSV and PDF.

> **Before writing code, read [IMPLEMENTATION.md](./IMPLEMENTATION.md).** It covers the
> architecture, the conventions, the security model, and the traps.
> [DESIGN.md](./DESIGN.md) is the design system.
> [UNDERSTANDING.md](./UNDERSTANDING.md) is the same product in plain language.
>
> **Product docs live in [`/docs`](./docs).** Start with the requirements and the weekly plan.
> This README covers the code/setup only.

## Run the whole thing

The stack is self-contained. No third-party account, no project to provision first:

```bash
cp .env.example .env          # then set at least ADMIN_PASSWORD
docker compose up -d --build
```

Four containers come up: `db` (Postgres 17 with a named volume), `init` (a one-shot job that
applies migrations and seeds, then exits), `app`, and `mailpit` (catches password-reset mail so
the reset flow works with no mail provider).

| Where | What |
|---|---|
| http://127.0.0.1:3000 | The application |
| http://127.0.0.1:8025 | Mailpit, to read the password-reset mail it caught |
| `docker compose logs -f init` | The initialization story, in order |

Sign in as `ADMIN_EMAIL` (default `admin@cecodes.local`). Delete the `ADMIN_PASSWORD` line
rather than leaving `.env.example`'s placeholder in it: the placeholder is long enough to pass
validation, so it would silently *become* the admin password. With the variable genuinely
absent, the seed generates a password and prints it **once**, in the `init` log, the first time
it creates the admin row. There is no other way into a fresh system: self-serve registration is off
(`FEATURE_SELF_ONBOARDING` in [src/lib/feature-flags.ts](src/lib/feature-flags.ts)), so CECODES
provisions every account from the admin screens.

For TLS on a real hostname, set `DOMAIN` in `.env` with DNS already pointing at the server, then
`docker compose --profile edge up -d` to add Caddy. Details, including pointing `DATABASE_URL` at
a Postgres you manage yourself, are in [docs/DOCKER_DEPLOYMENT.md](./docs/DOCKER_DEPLOYMENT.md).

## Tech stack

| Layer | Choice |
|---|---|
| App | **Next.js 16** (App Router, full-stack) · **React 19** |
| Styling / UI | **Tailwind CSS v4** · **shadcn/ui** (Radix UI) |
| Charts | **Recharts** (via shadcn `chart`) |
| Database | **Postgres** (the bundled `db` container, or any Postgres `DATABASE_URL` names) |
| Auth | **Self-hosted.** bcrypt password hashes in `app_users`, opaque session tokens in `user_sessions` |
| Isolation | [`src/lib/auth/company-scope.ts`](src/lib/auth/company-scope.ts) plus database constraints. **Not** RLS, see below |
| ORM | **Prisma 7** (pg driver adapter) |
| Mail | **nodemailer** (SMTP, Mailpit by default) or the **Resend** API · Handlebars templates |
| Reports | **exceljs** + **@react-pdf/renderer** |
| i18n | **next-intl** (UI in Spanish, es-CO) |
| Runtime/PM | **bun** · deploy on **Vercel** or with the Docker stack above |

> **RLS is inert at runtime.** The RLS policies exist in the migration chain, but Prisma connects
> as the database owner and bypasses every one of them. Tenant isolation rests on
> `company-scope.ts` and on the database constraints, and nothing else. Never claim RLS isolates
> tenants here. IMPLEMENTATION.md §8 is the full picture.

See [`docs/CECODES - Tech Stack Decision.md`](./docs/CECODES%20-%20Tech%20Stack%20Decision.md) for
the rationale.

## Working on the code

```bash
bun install                 # installs deps and runs `prisma generate`
cp .env.example .env.local  # set DATABASE_URL, DIRECT_URL, ADMIN_EMAIL, ADMIN_PASSWORD
bun run db:bootstrap        # objects the migration chain needs (idempotent, safe to re-run)
bun run db:deploy           # apply migrations
bun run db:seed             # reference data (grid factors + factor-library versions) + the admin
bun run db:import-factors   # load CECODES's full factor library from the Excel
bun run dev                 # http://localhost:3000
```

`bun run db:init` does the bootstrap, the migrations and the seed in one step; it is what the
`init` container runs, and it refuses to start when `DEMO_SEED_ALLOWED=true`.

### Scripts

| Command | Does |
|---|---|
| `bun run dev` | Start the dev server |
| `bun run build` / `bun run start` | Production build / serve |
| `bun run lint` / `bun run typecheck` | ESLint / TypeScript check |
| `bun run test` / `bun run test:e2e` | Vitest unit tests / Playwright end to end |
| `bun run db:init` | Bootstrap, migrate and seed in order. The `init` container's entrypoint |
| `bun run db:bootstrap` | Apply `scripts/bootstrap-db.sql`. Idempotent, must run before the migrations on a new database |
| `bun run db:deploy` | Apply pending migrations |
| `bun run db:studio` | Prisma Studio |
| `bun run db:seed` | Seed starter reference data and the single CECODES admin |
| `bun run db:seed:prod` | The real library + reference data + the travel-factor correction. Dry run without `--apply` |
| `bun run db:import-factors` | Import the full emission-factor library from `docs/reference/*.xlsx`. Add `--dry-run` to preview |
| `bun run db:seed:demo` | Seed the demo companies. Guarded, see below |
| `bun run db:generate` | Regenerate the Prisma client |
| `bun run db:verify-fresh` | Prove a virgin Postgres initializes from nothing, twice. **Throwaway database only** |
| `bun run db:audit-hashes` | Read-only. Assert every stored credential is a well-formed bcrypt hash |

### Demo data

`bun run db:seed:demo` creates four demo tenants for manual QA and for showing the tool to
CECODES. It is deliberately NOT part of `db:seed`.

| Account | Company | What it exercises |
|---|---|---|
| `demo1@demo.cecodes.invalid` | Demo Alimentos del Valle | Two sedes, reporting years 2023 and 2024, data across all three alcances. 2024 electricity is reported for 8 of 12 months, so the "8 de 12 meses" state is real |
| `demo2@demo.cecodes.invalid` | Demo Empresa Vacia | No sedes: every empty state in the product |
| `demo3@demo.cecodes.invalid` | Demo Textiles Andinos | One sede mid data entry, no Meta, and a 2025 year with no SIN grid factor: the missing-factor warning |
| `demo4@demo.cecodes.invalid` | Demo Empresa Inactiva | A deactivated company. The user is active, so the sign-in lands on "empresa desactivada" |
| `demo5@demo.cecodes.invalid` | Demo Alimentos del Valle | A deactivated user inside a healthy company: the "cuenta desactivada" screen |

All of them sign in with the value of `DEMO_PASSWORD`.

> **Know which database you are pointed at.** The compose stack gives every machine its own
> Postgres, but day to day the team still works against one shared database, whatever
> `.env.local` names, and that is where a stray write lands. `DEMO_SEED_ALLOWED=true` is the only
> thing stopping this script from putting demo companies in it: keep the flag in `.env.local` and
> never set it in a deployed environment. The script refuses to run without it, and `db:init`
> refuses to run *with* it. Never run `prisma migrate reset`, `TRUNCATE`, or the Prisma MCP
> `migrate-reset` tool against a database you did not create for the purpose.

> **Migrations: `prisma migrate dev` is not used.** Prisma checksums a migration once it has been
> applied, so migration 2 of the chain (`20260709120320_rls_and_auth`) can never be edited, and it
> depends on objects a plain Postgres does not have: the `authenticated` role, the `auth` schema,
> `auth.users`, and `auth.uid()`. [`scripts/bootstrap-db.sql`](./scripts/bootstrap-db.sql) supplies
> those idempotently before `prisma migrate deploy`; a shadow database built by `migrate dev` would
> never see it. Migrations are therefore hand-authored SQL. **Follow IMPLEMENTATION.md §7 exactly**;
> the short version is `prisma migrate diff` for the SQL, a new
> `prisma/migrations/<timestamp>_<name>/migration.sql` by hand, then `bun run db:deploy`.
> RLS policies and tenant helpers live in the `*_rls_and_auth` and `*_rls_session_identity`
> migrations, and are inert at runtime for the reason in the tech-stack note above.

## Project structure

```
prisma/
  schema.prisma          Domain model (Decimals everywhere; per-gas factors; versioned library)
  migrations/            Hand-authored SQL. See IMPLEMENTATION.md §7
  seed.ts                Reference data + the single admin. Idempotent
scripts/
  bootstrap-db.sql       Objects the migration chain needs, applied before it
  init-db.ts             What the `init` container runs
src/
  app/                   Next.js routes (UI + the report-export and health route handlers)
  components/ui/         shadcn/ui components (incl. chart = Recharts)
  features/              The screens: data-entry, dashboard, reports, admin, auth, ...
  lib/
    auth/                company-scope.ts (the authorization boundary), session.ts, password.ts,
                         password-reset.ts, route-gate.ts, throttle.ts
    mail/                Handlebars templates + the SMTP and Resend transports
    calc/                engine.ts, rollup.ts, and the Excel-parity harness in __tests__/
    gwp.ts               GWP (AR5/AR6) constants + year → GWP-set helper
    prisma.ts            Prisma client singleton (pg adapter)
    generated/prisma/    Generated Prisma client (git-ignored)
  proxy.ts               Next 16's middleware. Named `proxy`; gates routes via lib/auth/route-gate.ts
  instrumentation.ts     Validates the environment at boot and exits non-zero if it is wrong
docker-compose.yml       db + init + app + mailpit, and Caddy behind the `edge` profile
Dockerfile               deps → builder → migrator (the init job) → runner
e2e/                     Playwright: fixture tenant, setup, teardown, specs
docs/                    Product requirements, weekly plan, deployment guides, Excel reference
reference/               Legacy prototypes (kept for reference, not built)
```

## Environment

Copy `.env.example` → `.env` (Docker) or `.env.local` (local dev). The file documents every
variable; [src/lib/env.ts](src/lib/env.ts) is what actually validates them at boot.

| Variable | Required? | For |
|---|---|---|
| `DATABASE_URL` | **Yes** (defaulted under compose) | App runtime |
| `DIRECT_URL` | No | Unpooled connection for the Prisma CLI and migrations. Falls back to `DATABASE_URL` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | No | Only the bundled `db` container. `DATABASE_URL`'s compose default is built from them |
| `ADMIN_EMAIL` | **Yes, to initialize** | The single CECODES admin created by `prisma/seed.ts`. Missing, the seed throws rather than exiting 0 with nobody able to log in |
| `ADMIN_PASSWORD` | No | Same admin. Absent, one is generated and printed once. Present on a later run, it resets the password and ends that admin's sessions |
| `SEED_SKIP_ADMIN` | No | Skips admin creation entirely. Only for a database whose admin already exists; never in a deployment |
| `SITE_URL` | No | Absolute origin for the links in password-reset mail. Falls back to `DOMAIN`, then `VERCEL_URL` |
| `DOMAIN` | No | Public hostname for the optional Caddy TLS proxy |
| `MAIL_TRANSPORT` | No | `smtp` (default under compose), `resend`, or unset for no mail |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | With `smtp` | `SMTP_HOST` and `MAIL_FROM` are required together |
| `RESEND_API_KEY` | With `resend` | Required together with `MAIL_FROM` |
| `MAIL_FROM` | With either transport | A From header: a bare address, or `Name <address>` |
| `DEMO_SEED_ALLOWED` / `DEMO_PASSWORD` | No | **Local only.** The flag is the production brake on `db:seed:demo` |

If the database password contains characters that are reserved in a URI, such as `@` or `:`,
percent-encode them inside `DATABASE_URL` and `DIRECT_URL`. An `@` becomes `%40`.
