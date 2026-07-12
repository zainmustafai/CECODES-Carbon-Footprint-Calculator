<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes: APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# CECODES · Huella de Carbono

A multi-tenant web app where Colombian member companies of CECODES calculate their annual
corporate carbon footprint (GHG Protocol, Alcances 1/2/3), see it on a dashboard, and export
reports. It replaces the client's Excel tool, and **reproducing that Excel's totals is the
acceptance test** (docs §14). Plain-language overview: [UNDERSTANDING.md](./UNDERSTANDING.md).

**Stack (locked, do not propose alternatives):** Next.js 16 App Router full-stack on Vercel ·
React 19 (compiler on) · Tailwind v4 · shadcn/ui + Recharts · Supabase Postgres + Auth ·
Prisma 7 (pg adapter) · next-intl · exceljs + react-pdf · Vitest + Playwright · **bun**.

## Read before coding

| Situation | Read first |
| --- | --- |
| Anything touching tenant data or a Server Action | [IMPLEMENTATION.md](./IMPLEMENTATION.md) §8 (security model) |
| Schema or migration work | IMPLEMENTATION.md §6-7; comments in `prisma/schema.prisma` are normative |
| UI work | [DESIGN.md](./DESIGN.md); tokens live only in `src/app/globals.css` |
| Product questions, open client decisions | `docs/CECODES Carbon Footprint Tool - Requirements.md` (§12 = undecided) |
| Anything failing mysteriously | IMPLEMENTATION.md §11 (traps) |

## Commands

`bun run dev` · `typecheck` · `lint` · `test` (Vitest) · `test:e2e` (Playwright) ·
`db:deploy` · `db:seed` (idempotent) · `db:studio`.

Before claiming any work done:
`bun run typecheck && bun run lint && bun run test && bun run build`, confirm
`bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
prints an empty migration, then drive the real flow in a browser. Static checks passing is
not evidence a feature works.

## Non-negotiable domain rules (from the client)

1. **Excel parity.** The calculation engine must reproduce the Excel's totals.
2. **Scope 2 (electricity) is entered monthly; Scopes 1 & 3 are annual.**
   `ActivityEntry.month` is 1-12 for Scope 2, null otherwise.
3. **Every user-facing total is in tonnes (t CO2e).** kg is intermediate only; convert with
   `kgToTonnes`.
4. **Quantities and factors are Prisma `Decimal` (Postgres NUMERIC).** Never Int, Float, or a
   JavaScript number. Decimals cross the RSC boundary as **strings** (`.toString()`, never
   `Number()`).
5. **Element names and units come from the factor library** (exact Excel names). Nothing
   hardcoded.

## Security model (the part that bites)

- **RLS is inert at runtime.** Prisma connects as the database owner and bypasses every
  policy. Never claim RLS isolates tenants here.
- Isolation = database constraints + **`src/lib/auth/company-scope.ts`**, the single
  authorization boundary. **Every Server Action** that touches tenant data calls it first.
  Pages do not: they guard with `requireAppUser()`/`requireAdmin()` and pass a `companyId`
  down. So `loadDashboard()` and `loadPreview()` take a `companyId` and query Prisma with no
  authorization of their own; they are safe only because of their callers. Never hand them a
  user-supplied id without a guard.
- **Server Actions are public POST endpoints.** A layout guard (`requireAdmin()`) protects
  rendering only. Every action re-validates with its own Zod schema (`.strict()`) and
  re-authorizes, no matter what the UI already checked.
- `updateMany`/`deleteMany` return `{ count }` instead of throwing. **Check the count**, or a
  cross-tenant write reports success.
- **Never call Supabase from the browser.** No browser client exists in this repo and none
  may be added.
- The client never sends `scope`, `category`, `subcategory`, `element`, or `unit`; the server
  derives all five from the chosen `EmissionFactor`.
- Errors return opaque i18n keys, never sentences, and never reveal whether a resource exists.
- If you change authorization logic, `src/lib/auth/__tests__/company-scope.test.ts` changes
  with it.

## Conventions

- **Routes thin, features thick.** A `page.tsx` guards and renders a feature screen that
  takes `companyId` as a prop; that is how admin and company routes share one UI.
- **Hooks own logic, components own markup.** Zod + React Hook Form everywhere; schemas are
  factories taking a translator so messages localize.
- **Writes are optimistic.** UI updates immediately, the Server Action confirms in the
  background, failure rolls back to the last server-confirmed value and surfaces the error
  (feedback shapes: IMPLEMENTATION.md §4). Reference: `src/features/data-entry/lib/entry-store.ts`;
  elsewhere prefer React 19 `useOptimistic`.
- **UI language is Spanish (es-CO)** with an English toggle. All copy in `src/messages/`;
  domain terms stay Spanish everywhere (Alcance, Sede, Meta, Huella de Carbono).
- Import alias `@/*` = `./src/*`; all code under `src/`.
- Never use an em dash. Anywhere. Never cap width with arbitrary `max-w-*`.

## Hard traps (each has already cost someone an hour)

- **`prisma migrate dev` does not work** (Supabase pooler has no shadow database). Migrations
  are hand-authored SQL; follow IMPLEMENTATION.md §7 exactly.
- **There is ONE shared Supabase database.** Never run `prisma migrate reset`, `TRUNCATE`, or
  the Prisma MCP `migrate-reset` tool. E2E tests write to it inside their own `E2E ` namespace.
- Next 16: the middleware file is `src/proxy.ts` exporting `proxy`; `params`/`searchParams`
  are Promises.
- React Compiler is on, so the strict hooks lint findings are real bugs, not noise.
- A Postgres `CHECK` that evaluates to `NULL` passes; NULLs are distinct in unique indexes.
  See IMPLEMENTATION.md §11 before writing constraints.
