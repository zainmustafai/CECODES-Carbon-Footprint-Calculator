<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# CECODES · Huella de Carbono — project notes for agents

**What this is:** a corporate GHG carbon-footprint calculator + dashboard for CECODES. Multi-company
self-service, full parity with CECODES's Excel tool. Product spec is authoritative in [`/docs`](./docs).

**Stack (locked):** Next.js 16 full-stack on Vercel · React 19 · Tailwind v4 · shadcn/ui + Recharts ·
Supabase Postgres · Supabase Auth + **RLS** · Prisma 7 (pg adapter) · exceljs + react-pdf · next-intl.
Package manager: **bun**.

**Non-negotiable domain rules (from the client):**
- **Monthly entry applies to Scope 2 (electricity) only**; Scopes 1 & 3 are annual (`ActivityEntry.month` is null for them).
- **All user-facing totals are in tonnes (t CO₂e)**; kg is intermediate only.
- **Never use Int/Float for quantities or factors** — use Prisma `Decimal` (Postgres `NUMERIC`). The old prototype's integer bug must not return.
- Emission-factor **names/units come from the factor library** (exact Excel names). No hardcoded dropdowns with typos.
- The calculation engine must **reproduce the Excel's totals** (parity is the acceptance test — docs §14).

**Auth/isolation:** Supabase Auth; every tenant table needs **RLS**. ⚠️ Prisma does not pass the Supabase
JWT automatically — see the "Prisma + RLS" note in `docs/CECODES - Tech Stack Decision.md` before relying on RLS through Prisma.

**Conventions:** import alias `@/*`; UI language is **Spanish (es-CO)**; keep Spanish domain terms
(Alcance, Categoría, etc.). Run `bun run typecheck` and `bun run lint` before committing.
