# Supabase Removal, One-Click Deployment and Provable Auth Coverage: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every Supabase dependency from CECODES without losing data, make `docker compose up -d` produce a complete working system with its own database and mail server, and prove auth coverage with a build-breaking gate.

**Architecture:** Identity already lives in `app_users` + `user_sessions` behind `AUTH_PROVIDER=local`; this plan deletes the other two modes and the packages behind them. A guarded bootstrap SQL step runs before `prisma migrate deploy` so the twenty-migration chain, which depends on Supabase-only database objects, can replay onto a virgin Postgres while remaining a no-op on the live Supabase database. Mail becomes a three-part subsystem (render, transport, messages) with Handlebars templates read from disk.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 7 + `@prisma/adapter-pg`, Postgres 17, bcryptjs, Handlebars, nodemailer, Mailpit, Resend, Vitest, Playwright, bun, Docker Compose.

**Spec:** [docs/superpowers/specs/2026-09-04-supabase-removal-design.md](../specs/2026-09-04-supabase-removal-design.md)

## Global Constraints

- **Never use an em dash.** Anywhere, in code, comments, docs or commit messages.
- **Never run** `prisma migrate reset`, `TRUNCATE`, `DROP DATABASE`, or the Prisma MCP `migrate-reset` tool. There is ONE shared Supabase database holding real client data.
- **`prisma migrate dev` does not work** (the Supabase pooler has no shadow database). Migrations are hand-authored SQL.
- **Never `git add -A`.** Stage explicit file lists; the user co-commits to `main` mid-session.
- **Announce any database-touching command before running it.**
- **Never log or print** a password, hash, token, email address or connection string. The single documented exception is the generated admin password in Task 4.
- **Every Server Action** re-validates with its own `.strict()` Zod schema and calls `src/lib/auth/company-scope.ts` before touching tenant data. Do not modify `company-scope.ts`.
- **`updateMany`/`deleteMany` return `{ count }`.** Check the count or a cross-tenant write reports success.
- Errors return **opaque i18n keys**, never sentences, and never reveal whether a resource exists.
- Decimals cross the RSC boundary as **strings**. Quantities and factors are Prisma `Decimal`.
- Import alias `@/*` = `./src/*`. All code under `src/`.
- Next 16: middleware is `src/proxy.ts` exporting `proxy`; `params`/`searchParams` are Promises.
- React Compiler is on, so strict hooks lint findings are real bugs.
- Verification gate before claiming any task done: `bun run typecheck && bun run lint && bun run test`.

---

## File Structure

**Created**

| Path | Responsibility |
| --- | --- |
| `scripts/bootstrap-db.sql` | Four guarded `DO` blocks creating the Supabase-only database objects the migration chain needs. No-op on Supabase. |
| `scripts/verify-fresh-db.ts` | Proves a virgin Postgres initializes, twice, ending in an empty `migrate diff`. |
| `scripts/audit-password-hashes.ts` | Read-only. Asserts every `app_users.passwordHash` is well-formed bcrypt. |
| `src/lib/mail/render.ts` | Handlebars compile, partial registration, per-process cache. Knows nothing about sending. |
| `src/lib/mail/transport.ts` | Picks smtp / resend / none. The only export callers use to send. |
| `src/lib/mail/transports/smtp.ts` | nodemailer. Mailpit by default. |
| `src/lib/mail/transports/resend.ts` | The existing REST POST, moved. |
| `src/lib/mail/messages.ts` | Three typed builders. The only place copy and template data meet. |
| `src/lib/mail/templates/*.hbs` | layout, reset-password, welcome, password-changed. |
| `docs/auth/USE-CASES.md` | The 54-case register. |
| `src/lib/auth/__tests__/use-case-coverage.test.ts` | Build-breaking gate: every registered id must appear in a test name. |
| `e2e/password-reset.spec.ts` | Reset loop driven through Mailpit's HTTP API. |
| `docs/DATA-MIGRATION.md` | pg_dump/pg_restore runbook off Supabase-hosted Postgres. |

**Deleted**

`src/lib/supabase/` (admin.ts, server.ts, middleware.ts, `__tests__/middleware.test.ts`), `src/app/auth/callback/route.ts`, `src/app/auth/confirm/route.ts`, `src/lib/mail/send.ts`, `src/lib/mail/password-reset-email.ts`, packages `@supabase/ssr` and `@supabase/supabase-js`.

**Modified**

`scripts/init-db.ts`, `src/lib/env.ts`, `src/lib/auth/server.ts`, `src/lib/auth/route-gate.ts`, `src/proxy.ts`, `src/features/auth/actions/auth-actions.ts`, `src/features/admin/actions/user-actions.ts`, `src/features/auth/lib/errors.ts`, `src/features/auth/components/reset-password-screen.tsx`, `prisma/seed.ts`, `prisma/seed-demo.ts`, `e2e/fixture.ts`, `e2e/global-setup.ts`, `next.config.ts`, `vitest.config.ts`, `package.json`, `Dockerfile`, `docker-compose.yml`, `.env.example`, `AGENTS.md`, `IMPLEMENTATION.md`, `docs/DOCKER_DEPLOYMENT.md`.

---

# Phase 1: the fresh-database bootstrap

### Task 1: Bootstrap SQL that a virgin Postgres needs and Supabase ignores

**Files:**
- Create: `scripts/bootstrap-db.sql`
- Create: `scripts/verify-fresh-db.ts`
- Modify: `scripts/init-db.ts` (insert a step between "Waiting for the database" and "Applying pending migrations")
- Modify: `package.json` (scripts block)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `applyBootstrap(connectionString: string): Promise<void>` exported from `scripts/init-db.ts` is NOT required; the bootstrap is applied inline. Task 4 relies on `scripts/bootstrap-db.sql` existing at that exact path.

- [ ] **Step 1: Write the bootstrap SQL**

Create `scripts/bootstrap-db.sql`. Every block is guarded on non-existence so this file is a complete no-op against the live Supabase database.

```sql
-- Objects the migration chain needs that only Supabase's database provides.
--
-- Runs BEFORE `prisma migrate deploy`, every time, on every database. It is not a migration: it is
-- not in the ledger, it has no checksum, and it must stay idempotent forever.
--
-- Why it exists: migration 2 of 20 (20260709120320_rls_and_auth) grants to the `authenticated`
-- role, calls auth.uid() inside a LANGUAGE sql function body that Postgres validates at CREATE
-- time, and attaches a trigger to auth.users. CREATE ROLE authenticated appears only in migration
-- 20. Prisma checksums applied migrations, so migration 2 cannot be edited without breaking
-- `migrate deploy` against the live database. This file supplies the four objects instead.
--
-- On Supabase every guard skips, so nothing here can touch GoTrue.

-- 1. The role every one of the 49 policies grants to.
DO $bootstrap$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$bootstrap$;

-- 2. The auth schema. Guarded rather than CREATE SCHEMA IF NOT EXISTS because on Supabase the
--    connecting role does not own that schema and must not attempt to write in it at all.
DO $bootstrap$
BEGIN
  IF to_regnamespace('auth') IS NULL THEN
    EXECUTE 'CREATE SCHEMA auth';
  END IF;
END
$bootstrap$;

-- 3. The relation migration 2's trigger attaches to. These five columns are exactly what
--    prisma/backfill-auth-credentials.ts reads, so that script runs against either database.
DO $bootstrap$
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    EXECUTE 'CREATE TABLE auth.users (
      id uuid PRIMARY KEY,
      email text,
      encrypted_password text,
      email_confirmed_at timestamptz,
      last_sign_in_at timestamptz)';
  END IF;
END
$bootstrap$;

-- 4. The identity function migration 2 resolves inside two function bodies.
--
--    NOT written as CREATE OR REPLACE. On Supabase that would overwrite GoTrue's real auth.uid()
--    and break the hosted auth service for every project user. It is only ever created when the
--    function does not already exist.
DO $bootstrap$
BEGIN
  IF to_regprocedure('auth.uid()') IS NULL THEN
    EXECUTE 'CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$ SELECT NULL::uuid $fn$';
  END IF;
END
$bootstrap$;
```

- [ ] **Step 2: Write the failing verification script**

Create `scripts/verify-fresh-db.ts`. It runs against whatever `DATABASE_URL` names, so the caller points it at a throwaway container.

```ts
/**
 * Proves a virgin Postgres can be initialized from nothing, twice.
 *
 * Run against a THROWAWAY database only. It applies the bootstrap, every migration and the seed.
 * It never drops or truncates anything, but a database that already holds data will simply be
 * migrated and seeded, which is not what this script is for.
 *
 *   docker run -d --name cecodes-verify -e POSTGRES_PASSWORD=verify -p 55432:5432 postgres:17-alpine
 *   DATABASE_URL=postgresql://postgres:verify@127.0.0.1:55432/postgres \
 *   DIRECT_URL=postgresql://postgres:verify@127.0.0.1:55432/postgres \
 *   ADMIN_EMAIL=verify@example.org ADMIN_PASSWORD=verify-password-1234 \
 *   bun scripts/verify-fresh-db.ts
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Client } from "pg";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DIRECT_URL or DATABASE_URL must be set");

function run(label: string, command: string, args: string[]) {
  console.log(`[verify] ${label}...`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) throw new Error(`${label} exited with ${result.status}`);
}

async function bootstrap() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(readFileSync("scripts/bootstrap-db.sql", "utf8"));
  } finally {
    await client.end();
  }
}

async function pass(n: number) {
  console.log(`[verify] === pass ${n} ===`);
  await bootstrap();
  run("migrate deploy", "bunx", ["prisma", "migrate", "deploy"]);
  run("seed", "bun", ["prisma/seed.ts"]);
}

// Twice, because idempotency is the property under test. A bootstrap that works once and fails on
// a second container start would leave a deployment that cannot restart.
await pass(1);
await pass(2);

// The schema Prisma would generate must equal the schema the migrations produced. A non-empty
// diff means the migration chain and schema.prisma have drifted.
const diff = spawnSync(
  "bunx",
  ["prisma", "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--script"],
  { encoding: "utf8", shell: process.platform === "win32" },
);
const body = (diff.stdout ?? "")
  .split("\n")
  .filter((line) => line.trim() && !line.trim().startsWith("--"))
  .join("\n");
if (body.trim()) throw new Error(`Schema drift after migrate deploy:\n${body}`);

console.log("[verify] OK: fresh database initializes twice and matches schema.prisma");
```

- [ ] **Step 3: Run it to verify it fails**

Announce the command first (it starts a database container). Then:

```bash
docker run -d --name cecodes-verify -e POSTGRES_PASSWORD=verify -p 55432:5432 postgres:17-alpine
DATABASE_URL=postgresql://postgres:verify@127.0.0.1:55432/postgres DIRECT_URL=postgresql://postgres:verify@127.0.0.1:55432/postgres ADMIN_EMAIL=verify@example.org ADMIN_PASSWORD=verify-password-1234 bun scripts/verify-fresh-db.ts
```

Expected: FAIL. Without the bootstrap wired into `init-db.ts` this still passes, because the script calls `bootstrap()` itself. So to see the real failure first, temporarily comment out the `await bootstrap()` line and confirm `migrate deploy` dies with `role "authenticated" does not exist`. Restore the line afterwards.

- [ ] **Step 4: Wire the bootstrap into the init job**

In `scripts/init-db.ts`, add the import and a step between reachability and migrations.

```ts
import { readFileSync } from "node:fs";
```

Then, immediately after `await waitForDatabase(migrationUrl);` and before the `run("Applying pending migrations", ...)` call:

```ts
  // 2b. Objects the migration chain needs that only Supabase supplies. Idempotent and guarded per
  //     object, so this is a no-op on a Supabase database and the reason a plain Postgres works at
  //     all. See scripts/bootstrap-db.sql for why migration 2 cannot simply be edited.
  log("Applying database bootstrap...");
  const bootstrapClient = new Client({ connectionString: migrationUrl });
  try {
    await bootstrapClient.connect();
    await bootstrapClient.query(readFileSync("scripts/bootstrap-db.sql", "utf8"));
    log("Database bootstrap completed.");
  } catch (error) {
    fail("Database bootstrap failed.", error);
  } finally {
    await bootstrapClient.end().catch(() => {});
  }
```

- [ ] **Step 5: Add the script entries**

In `package.json` scripts, after `"db:deploy"`:

```json
    "db:bootstrap": "bun -e \"const {Client}=require('pg');const fs=require('fs');const c=new Client({connectionString:process.env.DIRECT_URL??process.env.DATABASE_URL});c.connect().then(()=>c.query(fs.readFileSync('scripts/bootstrap-db.sql','utf8'))).then(()=>c.end()).then(()=>console.log('bootstrap ok'))\"",
    "db:verify-fresh": "bun scripts/verify-fresh-db.ts",
```

- [ ] **Step 6: Run the verification to confirm it passes**

```bash
DATABASE_URL=postgresql://postgres:verify@127.0.0.1:55432/postgres DIRECT_URL=postgresql://postgres:verify@127.0.0.1:55432/postgres ADMIN_EMAIL=verify@example.org ADMIN_PASSWORD=verify-password-1234 bun scripts/verify-fresh-db.ts
```

Expected: PASS, printing `OK: fresh database initializes twice and matches schema.prisma`.

- [ ] **Step 7: Prove the Supabase skip path (spec V7)**

The verification container now already has all four objects, because pass 1 created them. Re-running the bootstrap alone must be silent and successful:

```bash
DIRECT_URL=postgresql://postgres:verify@127.0.0.1:55432/postgres bun run db:bootstrap
```

Expected: `bootstrap ok`, no errors. This is the same code path a Supabase database takes, where all four objects pre-exist.

- [ ] **Step 8: Tear down and commit**

```bash
docker rm -f cecodes-verify
git add scripts/bootstrap-db.sql scripts/verify-fresh-db.ts scripts/init-db.ts package.json
git commit -m "feat(db): let the migration chain replay onto a plain Postgres"
```

---

### Task 2: A database service in compose

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `scripts/bootstrap-db.sql` and the init wiring from Task 1.
- Produces: a `db` service on the `internal` network reachable as host `db` port `5432`, and a `pgdata` named volume. Task 4 and Task 13 depend on both names.

- [ ] **Step 1: Add the db service**

In `docker-compose.yml`, insert before the `init` service:

```yaml
  # -------------------------------------------------------------------------------------------
  # db - the application database
  # -------------------------------------------------------------------------------------------
  # No published port, deliberately. Every consumer is on the internal network, and publishing
  # 5432 on a VPS is how a database ends up in a botnet's scan results the same afternoon.
  # The password below is therefore a default rather than a secret; override it in .env if you
  # ever do publish the port.
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-cecodes}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-cecodes-local-dev}
      POSTGRES_DB: ${POSTGRES_DB:-cecodes}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      # -U matters: pg_isready defaults to the OS user (root), which is not a Postgres role here,
      # so without it the probe fails on a perfectly healthy database.
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-cecodes} -d ${POSTGRES_DB:-cecodes}"]
      interval: 5s
      timeout: 5s
      retries: 20
      start_period: 10s
    restart: unless-stopped
    networks: [internal]
```

- [ ] **Step 2: Give init and app a database and a default URL**

Add to BOTH the `init` and `app` services, after their `env_file` blocks:

```yaml
    environment:
      # The default points at the db service above, so `docker compose up -d` works with no .env
      # at all. A .env or .env.local entry overrides it, which is how a deployment points at a
      # managed Postgres instead.
      DATABASE_URL: ${DATABASE_URL:-postgresql://cecodes:cecodes-local-dev@db:5432/cecodes}
      DIRECT_URL: ${DIRECT_URL:-${DATABASE_URL:-postgresql://cecodes:cecodes-local-dev@db:5432/cecodes}}
      SITE_URL: ${SITE_URL:-http://localhost:3000}
```

And add the dependency to `init` only:

```yaml
    depends_on:
      db:
        condition: service_healthy
```

- [ ] **Step 3: Declare the volume**

In the `volumes:` block at the bottom, above `caddy_data`:

```yaml
  # The database. Losing this volume loses every company, entry and result, so it is named rather
  # than anonymous: `docker compose down` leaves it alone, and only `down -v` removes it.
  pgdata:
```

- [ ] **Step 4: Verify compose resolves**

```bash
docker compose config >/dev/null && echo "compose config OK"
```

Expected: `compose config OK`.

- [ ] **Step 5: Bring the stack up with no .env and confirm the database initializes**

Announce first, then:

```bash
mv .env.local .env.local.bak 2>/dev/null; docker compose up -d --build
docker compose logs init
```

Expected: the init log shows `Database bootstrap completed.`, migrations applied, and `Initialization complete.` Restore with `mv .env.local.bak .env.local` afterwards.

Note: this will fail at env validation until Task 4 gives `ADMIN_PASSWORD` a generated fallback. If it fails on `ADMIN_PASSWORD must be at least 12 characters`, that is the expected state at this point in the plan; record it and continue.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "feat(docker): give the stack its own Postgres"
```

---

# Phase 2: the mail subsystem

### Task 3: Handlebars rendering

**Files:**
- Create: `src/lib/mail/render.ts`
- Create: `src/lib/mail/templates/layout.hbs`
- Create: `src/lib/mail/templates/reset-password.hbs`
- Create: `src/lib/mail/templates/welcome.hbs`
- Create: `src/lib/mail/templates/password-changed.hbs`
- Create: `src/lib/mail/__tests__/render.test.ts`
- Modify: `next.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `export type TemplateName = "reset-password" | "welcome" | "password-changed"`
  - `export const TEMPLATE_NAMES: readonly TemplateName[]`
  - `export function renderTemplate(name: TemplateName, data: Record<string, unknown>): string`

  Task 5 (`messages.ts`) consumes all three.

- [ ] **Step 1: Install Handlebars**

```bash
bun add handlebars
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/mail/__tests__/render.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TEMPLATE_NAMES, renderTemplate } from "@/lib/mail/render";

describe("renderTemplate", () => {
  it("every declared template resolves to a readable file", () => {
    // The failure this catches is a template missing from the standalone build, which would
    // otherwise surface only to a user who needed a password.
    for (const name of TEMPLATE_NAMES) {
      expect(() => renderTemplate(name, { resetUrl: "https://x.test/r", expiry: "30 minutos" })).not.toThrow();
    }
  });

  it("wraps the body in the shared layout", () => {
    const html = renderTemplate("reset-password", { resetUrl: "https://x.test/r", expiry: "30 minutos" });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("https://x.test/r");
  });

  it("escapes interpolated values", () => {
    const html = renderTemplate("reset-password", {
      resetUrl: "https://x.test/r?a=1&b=2",
      expiry: "30 minutos",
    });
    // Handlebars {{ }} escapes by default. A token is the one part of this document that is not
    // a literal written by us, so it must never be emitted through {{{ }}}.
    expect(html).toContain("a=1&amp;b=2");
    expect(html).not.toContain("a=1&b=2");
  });

  it("throws a named error for an unknown template rather than returning empty output", () => {
    // @ts-expect-error deliberately outside TemplateName
    expect(() => renderTemplate("does-not-exist", {})).toThrow(/does-not-exist/);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bunx vitest run src/lib/mail/__tests__/render.test.ts`
Expected: FAIL with `Cannot find module '@/lib/mail/render'`.

- [ ] **Step 4: Write the renderer**

Create `src/lib/mail/render.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Handlebars from "handlebars";

// Email bodies, compiled from .hbs files on disk.
//
// Read at runtime rather than imported, so an operator can `docker cp` a corrected template into a
// running container and restart it. Two things make that survive `output: "standalone"`, which
// traces imports and would otherwise ship none of these files: outputFileTracingIncludes in
// next.config.ts, and an explicit COPY in the Dockerfile's runner stage. Both, deliberately.

export type TemplateName = "reset-password" | "welcome" | "password-changed";

export const TEMPLATE_NAMES = [
  "reset-password",
  "welcome",
  "password-changed",
] as const satisfies readonly TemplateName[];

// Resolved from cwd, not from import.meta.url. The standalone server runs from /app with the
// templates at /app/src/lib/mail/templates, and __dirname inside a traced bundle does not point
// anywhere useful.
const TEMPLATE_DIR = join(process.cwd(), "src", "lib", "mail", "templates");

// Compiled once per process. Templates cannot change under a running container without a restart,
// so a cache is free correctness rather than a risk.
const cache = new Map<string, Handlebars.TemplateDelegate>();

let layoutRegistered = false;

function compile(file: string): Handlebars.TemplateDelegate {
  const cached = cache.get(file);
  if (cached) return cached;

  let source: string;
  try {
    source = readFileSync(join(TEMPLATE_DIR, file), "utf8");
  } catch (cause) {
    // Named, because the only realistic cause is a template missing from a built image, and a
    // generic ENOENT sends whoever reads it looking in the wrong place.
    throw new Error(`Email template not found: ${file} (looked in ${TEMPLATE_DIR})`, { cause });
  }

  const compiled = Handlebars.compile(source, { strict: false, noEscape: false });
  cache.set(file, compiled);
  return compiled;
}

/** Renders one template inside the shared layout. Values are HTML-escaped by Handlebars. */
export function renderTemplate(name: TemplateName, data: Record<string, unknown>): string {
  if (!TEMPLATE_NAMES.includes(name)) {
    throw new Error(`Unknown email template: ${name}`);
  }

  if (!layoutRegistered) {
    // Registered rather than inlined per template, so the table scaffolding that keeps Outlook and
    // Gmail honest lives in exactly one file.
    Handlebars.registerPartial("layout", compile("layout.hbs"));
    layoutRegistered = true;
  }

  return compile(`${name}.hbs`)(data);
}
```

- [ ] **Step 5: Write the layout partial**

Create `src/lib/mail/templates/layout.hbs`. Tables and inline attributes on purpose: Outlook renders through Word, Gmail strips `<style>` blocks, and neither fetches a stylesheet.

```handlebars
{{!-- Shared shell for every message. No image and no tracking pixel: a message whose only job is
      to carry one link should not ask the reader's client to phone anywhere, and a remote image is
      also what gets a message blocked before the link is ever seen.
      #002060 is --primary from globals.css, in hex because email clients do not resolve oklch(). --}}
<!doctype html>
<html lang="es">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background-color:#ffffff;border-radius:8px;">
<tr><td style="padding:32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#1a1a1a;">
<p style="margin:0 0 16px;font-size:20px;font-weight:bold;color:#002060;">{{title}}</p>
{{> @partial-block }}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
```

- [ ] **Step 6: Write the three bodies**

`src/lib/mail/templates/reset-password.hbs`:

```handlebars
{{#> layout title="Restablece tu contraseña"}}
<p style="margin:0 0 16px;">Recibimos una solicitud para restablecer la contraseña de tu cuenta en Huella de Carbono CECODES.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
<tr><td align="center" bgcolor="#002060" style="border-radius:6px;">
<a href="{{resetUrl}}" style="display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;">Crear una nueva contraseña</a>
</td></tr>
</table>
{{!-- The link appears twice on purpose: some clients drop the styled cell that makes the button,
      and some readers forward the message as plain text. --}}
<p style="margin:0 0 8px;">Si el botón no funciona, copia este enlace en tu navegador:</p>
<p style="margin:0 0 16px;word-break:break-all;"><a href="{{resetUrl}}" style="color:#002060;">{{resetUrl}}</a></p>
<p style="margin:0 0 16px;">El enlace vence en {{expiry}} y solo se puede usar una vez.</p>
<p style="margin:0;color:#555555;">Si no solicitaste el cambio, ignora este mensaje. Tu contraseña actual sigue siendo válida.</p>
{{/layout}}
```

`src/lib/mail/templates/welcome.hbs`:

```handlebars
{{#> layout title="Tu cuenta en Huella de Carbono"}}
<p style="margin:0 0 16px;">{{#if name}}Hola {{name}}: se{{else}}Se{{/if}} creó una cuenta para ti en Huella de Carbono CECODES.</p>
<p style="margin:0 0 16px;">Tu usuario es <strong>{{email}}</strong>. Define tu contraseña con este enlace:</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
<tr><td align="center" bgcolor="#002060" style="border-radius:6px;">
<a href="{{setPasswordUrl}}" style="display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;">Definir mi contraseña</a>
</td></tr>
</table>
<p style="margin:0 0 8px;">Si el botón no funciona, copia este enlace en tu navegador:</p>
<p style="margin:0 0 16px;word-break:break-all;"><a href="{{setPasswordUrl}}" style="color:#002060;">{{setPasswordUrl}}</a></p>
<p style="margin:0;color:#555555;">El enlace vence en {{expiry}}. Si vence, pide uno nuevo desde "Olvidé mi contraseña" en la pantalla de ingreso.</p>
{{/layout}}
```

`src/lib/mail/templates/password-changed.hbs`:

```handlebars
{{#> layout title="Tu contraseña cambió"}}
<p style="margin:0 0 16px;">La contraseña de tu cuenta en Huella de Carbono CECODES {{#if byAdmin}}fue restablecida por un administrador de CECODES{{else}}se cambió{{/if}} el {{changedAt}}.</p>
<p style="margin:0 0 16px;">Todas las sesiones abiertas se cerraron, así que tendrás que ingresar de nuevo.</p>
<p style="margin:0;color:#555555;">Si no fuiste tú, escribe a CECODES de inmediato: alguien más tiene acceso a tu cuenta.</p>
{{/layout}}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bunx vitest run src/lib/mail/__tests__/render.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 8: Make the templates survive the standalone build**

In `next.config.ts`, add two keys to `nextConfig`, after `output: "standalone",`:

```ts
  // The .hbs files under src/lib/mail/templates are read with fs at runtime, so Next's import
  // tracing cannot see them and would ship none of them. Without this the standalone server throws
  // "Email template not found" the first time anyone asks for a password reset. The Dockerfile also
  // COPYs the directory, deliberately: a missing template is discovered by a locked-out user.
  outputFileTracingIncludes: {
    "/**": ["./src/lib/mail/templates/**"],
  },
  // handlebars compiles templates with new Function, which a bundler cannot follow. Leaving it
  // external keeps it a plain node_modules require at runtime.
  serverExternalPackages: ["handlebars"],
```

- [ ] **Step 9: Verify the build still succeeds**

Run: `bun run typecheck && bun run lint && bun run build`
Expected: all three succeed.

- [ ] **Step 10: Commit**

```bash
git add src/lib/mail/render.ts src/lib/mail/templates src/lib/mail/__tests__/render.test.ts next.config.ts package.json bun.lock
git commit -m "feat(mail): Handlebars templates with a shared layout"
```

---

### Task 4: Transports, environment, and the generated admin password

**Files:**
- Create: `src/lib/mail/transports/smtp.ts`
- Create: `src/lib/mail/transports/resend.ts`
- Create: `src/lib/mail/transport.ts`
- Create: `src/lib/mail/__tests__/transport.test.ts`
- Modify: `src/lib/env.ts`
- Modify: `prisma/seed.ts`
- Modify: `docker-compose.yml`
- Modify: `package.json`, `next.config.ts`

**Interfaces:**
- Consumes: nothing from Task 3 (transport does not render).
- Produces:
  - `export type MailMessage = { to: string; subject: string; html: string; text: string }`
  - `export type MailResult = { ok: true } | { ok: false; reason: "not-configured" | "failed" }`
  - `export async function sendMail(message: MailMessage): Promise<MailResult>`
  - `export type MailTransport = "smtp" | "resend" | "none"` and `export function mailTransport(source?: Record<string, string | undefined>): MailTransport` from `src/lib/env.ts`
  - `mailConfigured(source?)` in `src/lib/env.ts` keeps its name and signature but becomes transport-aware.

  Task 5 consumes `sendMail` and `MailMessage`.

- [ ] **Step 1: Install nodemailer**

```bash
bun add nodemailer && bun add -d @types/nodemailer
```

- [ ] **Step 2: Write the failing transport test**

Create `src/lib/mail/__tests__/transport.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const MESSAGE = { to: "a@b.test", subject: "s", html: "<p>h</p>", text: "t" };

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("sendMail", () => {
  it("returns not-configured when MAIL_TRANSPORT is unset", async () => {
    vi.stubEnv("MAIL_TRANSPORT", "");
    const { sendMail } = await import("@/lib/mail/transport");
    expect(await sendMail(MESSAGE)).toEqual({ ok: false, reason: "not-configured" });
  });

  it("returns not-configured when resend is selected without a key", async () => {
    vi.stubEnv("MAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("MAIL_FROM", "CECODES <no-reply@x.test>");
    const { sendMail } = await import("@/lib/mail/transport");
    expect(await sendMail(MESSAGE)).toEqual({ ok: false, reason: "not-configured" });
  });

  it("refuses an API key that is not a usable header value, without quoting it", async () => {
    vi.stubEnv("MAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_broken\nkey");
    vi.stubEnv("MAIL_FROM", "CECODES <no-reply@x.test>");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { sendMail } = await import("@/lib/mail/transport");

    expect(await sendMail(MESSAGE)).toEqual({ ok: false, reason: "not-configured" });
    // fetch would throw "Bearer re_broken\nkey is an invalid header value" and reportError would
    // then write the whole key to the log. Turning it away here is what keeps it out of the line.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warn.mock.calls.flat().join(" ")).not.toContain("re_broken");
  });

  it("never throws when the provider is unreachable", async () => {
    vi.stubEnv("MAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_valid_key");
    vi.stubEnv("MAIL_FROM", "CECODES <no-reply@x.test>");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    const { sendMail } = await import("@/lib/mail/transport");
    expect(await sendMail(MESSAGE)).toEqual({ ok: false, reason: "failed" });
  });

  it("never logs the recipient", async () => {
    vi.stubEnv("MAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_valid_key");
    vi.stubEnv("MAIL_FROM", "CECODES <no-reply@x.test>");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { sendMail } = await import("@/lib/mail/transport");

    expect(await sendMail(MESSAGE)).toEqual({ ok: true });
    // "who asked for a password reset" is exactly the fact these logs must not carry.
    expect(info.mock.calls.flat().join(" ")).not.toContain("a@b.test");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bunx vitest run src/lib/mail/__tests__/transport.test.ts`
Expected: FAIL with `Cannot find module '@/lib/mail/transport'`.

- [ ] **Step 4: Move the Resend sender**

Create `src/lib/mail/transports/resend.ts` by moving the body of `src/lib/mail/send.ts` verbatim, keeping every comment, and changing only the exported name and its return contract:

```ts
import { reportError } from "@/lib/observability/report-error";
import type { MailMessage, MailResult } from "@/lib/mail/transport";

// Resend, one POST wide. Deliberately the REST endpoint and not the `resend` package: the API is a
// single JSON POST, so the package would buy nothing but a dependency to keep current and another
// module for the standalone build to trace.
//
// Nothing in this file throws. Its caller is the password reset action, which has to behave
// identically whether or not the address belongs to an account: an exception escaping here would
// surface as a different response for a real address than for an invented one, which is an account
// enumeration oracle handed out for free.

const ENDPOINT = "https://api.resend.com/emails";

/** Past a healthy Resend call, well short of any request timeout above us. */
const TIMEOUT_MS = 10_000;

/**
 * Visible ASCII, which is every character an API key has and the only range a header value can
 * carry without argument. Checked BEFORE the key reaches the request: fetch quotes the offending
 * value back at you, that error is what reportError would write, and a key that wrapped when it
 * was pasted into a .env file would then print in full, once per reset attempt, in the one log an
 * operator is most likely to ship somewhere else.
 */
const HEADER_SAFE = /^[\x21-\x7e]+$/;

export async function sendViaResend(message: MailMessage): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim();

  if (!apiKey || !from) {
    const missing = [!apiKey && "RESEND_API_KEY", !from && "MAIL_FROM"].filter(Boolean).join(", ");
    console.warn(`[mail] not sent, unset: ${missing}`);
    return { ok: false, reason: "not-configured" };
  }
  if (!HEADER_SAFE.test(apiKey)) {
    console.warn("[mail] not sent, RESEND_API_KEY is not a usable header value");
    return { ok: false, reason: "not-configured" };
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      // The status, and nothing else. Resend quotes the offending address back in its error body.
      reportError({
        where: "mail/resend",
        error: new Error("Resend rejected the request"),
        context: { status: response.status },
      });
      return { ok: false, reason: "failed" };
    }

    console.info(`[mail] sent via resend (${response.status})`);
    return { ok: true };
  } catch (error) {
    reportError({ where: "mail/resend", error });
    return { ok: false, reason: "failed" };
  }
}
```

- [ ] **Step 5: Write the SMTP transport**

Create `src/lib/mail/transports/smtp.ts`:

```ts
import nodemailer from "nodemailer";
import { reportError } from "@/lib/observability/report-error";
import type { MailMessage, MailResult } from "@/lib/mail/transport";

// SMTP, for Mailpit in development and test and for any deployment that already has a relay.
//
// Same contract as the Resend transport: nothing throws, nothing about the message is logged.

const TIMEOUT_MS = 10_000;

export async function sendViaSmtp(message: MailMessage): Promise<MailResult> {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.MAIL_FROM?.trim();
  if (!host || !from) {
    const missing = [!host && "SMTP_HOST", !from && "MAIL_FROM"].filter(Boolean).join(", ");
    console.warn(`[mail] not sent, unset: ${missing}`);
    return { ok: false, reason: "not-configured" };
  }

  const port = Number(process.env.SMTP_PORT?.trim() || "1025");
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD?.trim();

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      // Implicit TLS is port 465 only. Mailpit on 1025 speaks plaintext, and a relay on 587
      // upgrades with STARTTLS, which nodemailer does on its own when secure is false.
      secure: port === 465,
      // Mailpit accepts anything and needs no credentials, so auth is omitted rather than sent
      // empty: an empty user makes nodemailer offer AUTH LOGIN with a blank name, which Mailpit
      // accepts and a real relay rejects.
      auth: user && password ? { user, pass: password } : undefined,
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    });

    await transporter.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    console.info("[mail] sent via smtp");
    return { ok: true };
  } catch (error) {
    // nodemailer puts the recipient in some error messages, so the error is handed to reportError
    // (which redacts and never throws) rather than logged here.
    reportError({ where: "mail/smtp", error });
    return { ok: false, reason: "failed" };
  }
}
```

- [ ] **Step 6: Write the transport selector**

Create `src/lib/mail/transport.ts`:

```ts
import { mailTransport } from "@/lib/env";

export type MailMessage = { to: string; subject: string; html: string; text: string };
export type MailResult = { ok: true } | { ok: false; reason: "not-configured" | "failed" };

/**
 * Sends one message through whichever transport is configured.
 *
 * Both bodies are required: `text` is what a client that refuses HTML shows, and a message with no
 * text part is what spam filters score against.
 *
 * Never throws. Every failure path returns a MailResult, and the reset action ignores it, because
 * that action must answer identically for a real address and an invented one.
 */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  switch (mailTransport()) {
    case "smtp": {
      // Imported lazily so that a Resend-only deployment never loads nodemailer, and so that a
      // missing SMTP dependency cannot break the module graph for everyone.
      const { sendViaSmtp } = await import("@/lib/mail/transports/smtp");
      return sendViaSmtp(message);
    }
    case "resend": {
      const { sendViaResend } = await import("@/lib/mail/transports/resend");
      return sendViaResend(message);
    }
    default:
      // A deployment with no mail configured is a normal state, not an error: it is what a trial
      // run looks like. Callers check mailConfigured() first and refuse the reset up front.
      console.warn("[mail] not sent, MAIL_TRANSPORT is not set");
      return { ok: false, reason: "not-configured" };
  }
}
```

- [ ] **Step 7: Teach env.ts about transports**

In `src/lib/env.ts`, add near `AUTH_PROVIDERS`:

```ts
const MAIL_TRANSPORTS = ["smtp", "resend", "none"] as const;

/**
 * Where outbound mail goes. Unset means "none", so a deployment that has never configured mail
 * runs normally and refuses password resets up front rather than accepting one it cannot deliver.
 */
export type MailTransport = (typeof MAIL_TRANSPORTS)[number];

const mailTransportSchema = z.enum(MAIL_TRANSPORTS, {
  message: "MAIL_TRANSPORT must be one of: smtp, resend, none",
});
```

Add to `runtimeSchema`'s object literal:

```ts
  MAIL_TRANSPORT: optionalVar(mailTransportSchema),
  SMTP_HOST: optionalVar(z.string()),
  SMTP_PORT: optionalVar(z.coerce.number().int().positive().max(65535)),
  SMTP_USER: optionalVar(z.string()),
  SMTP_PASSWORD: optionalVar(z.string()),
```

Replace the existing `.superRefine` half-configuration rule with one that covers both transports:

```ts
  .superRefine((env, ctx) => {
    const transport = env.MAIL_TRANSPORT ?? "none";
    if (transport === "none") return;

    // Half a mail configuration is always a mistake and never a state anyone chose, and nothing
    // downstream can raise it: sendMail() warns only once a user has already asked for a reset.
    // This is the one line that says so at boot.
    const required =
      transport === "resend" ? (["RESEND_API_KEY", "MAIL_FROM"] as const) : (["SMTP_HOST", "MAIL_FROM"] as const);
    for (const name of required) {
      if (!env[name]) {
        ctx.addIssue({ code: "custom", message: `${name} is required when MAIL_TRANSPORT=${transport}` });
      }
    }
  });
```

Add the two readers, replacing the old `mailConfigured`:

```ts
/** The transport in force. Unset, or unreadable, answers "none". */
export function mailTransport(source: EnvSource = process.env): MailTransport {
  const parsed = mailTransportSchema.safeParse(source.MAIL_TRANSPORT?.trim());
  return parsed.success ? parsed.data : "none";
}

/**
 * Whether mail can be sent at all. Callers check it before writing a token row, so a deployment
 * with no mail refuses the reset up front rather than telling a user to watch an inbox nothing
 * will arrive in.
 */
export function mailConfigured(source: EnvSource = process.env): boolean {
  const from = Boolean(source.MAIL_FROM?.trim());
  switch (mailTransport(source)) {
    case "smtp":
      return from && Boolean(source.SMTP_HOST?.trim());
    case "resend":
      return from && Boolean(source.RESEND_API_KEY?.trim());
    default:
      return false;
  }
}
```

- [ ] **Step 8: Run the transport tests to verify they pass**

Run: `bunx vitest run src/lib/mail/__tests__/transport.test.ts src/lib/__tests__/env.test.ts`
Expected: PASS. If `env.test.ts` asserts the old both-or-neither Resend rule, update those cases to the transport-aware rule above.

- [ ] **Step 9: Generate an admin password when none is configured**

In `src/lib/env.ts`, `initSchemaFor`, relax the `ADMIN_PASSWORD` requirement so an unset value is allowed and a set-but-weak value is still refused:

```ts
    // Optional, because init generates one when it is unset (and prints it once). A value that IS
    // provided must still be usable, so the length rule stays on the present case only.
    ADMIN_PASSWORD: optionalVar(z.string().min(12, "ADMIN_PASSWORD must be at least 12 characters")),
```

In `prisma/seed.ts`, where the admin password is read, add the fallback. Find the block that currently refuses when `!password` and replace the refusal for that one variable with:

```ts
  // ADMIN_PASSWORD unset means "generate one". This is the single place in the codebase allowed to
  // print a credential, and it is a deliberate exception: the alternative is a fixed default admin
  // password, which on a public VPS is a backdoor. It fires only when the variable is unset, only
  // when the admin does not already exist, and prints once.
  const generated = !password;
  const adminPassword = password ?? generateTempPassword(24);
```

After the admin upsert, when `generated` is true AND the upsert created rather than updated the row:

```ts
  if (generated && created) {
    console.log("");
    console.log("  ============================================================");
    console.log("   ADMIN ACCOUNT CREATED");
    console.log(`   email:    ${email}`);
    console.log(`   password: ${adminPassword}`);
    console.log("   Sign in and change this now. It is not shown again.");
    console.log("   Set ADMIN_PASSWORD in .env to choose your own instead.");
    console.log("  ============================================================");
    console.log("");
  }
```

Import `generateTempPassword` from `../src/lib/generate-password`.

- [ ] **Step 10: Add the mail defaults to compose**

In `docker-compose.yml`, extend the `environment:` blocks added in Task 2 for BOTH `init` and `app`:

```yaml
      MAIL_TRANSPORT: ${MAIL_TRANSPORT:-smtp}
      SMTP_HOST: ${SMTP_HOST:-mailpit}
      SMTP_PORT: ${SMTP_PORT:-1025}
      MAIL_FROM: ${MAIL_FROM:-CECODES <no-reply@localhost>}
      ADMIN_EMAIL: ${ADMIN_EMAIL:-admin@cecodes.local}
```

- [ ] **Step 11: Verify the whole suite**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: all pass.

- [ ] **Step 12: Commit**

```bash
git add src/lib/mail/transport.ts src/lib/mail/transports src/lib/mail/__tests__/transport.test.ts src/lib/env.ts src/lib/__tests__/env.test.ts prisma/seed.ts docker-compose.yml package.json bun.lock
git commit -m "feat(mail): smtp and resend transports behind one selector"
```

---

### Task 5: Typed messages, wired into the actions that send them

**Files:**
- Create: `src/lib/mail/messages.ts`
- Create: `src/lib/mail/__tests__/messages.test.ts`
- Modify: `src/features/auth/actions/auth-actions.ts`
- Modify: `src/features/admin/actions/user-actions.ts`
- Delete: `src/lib/mail/send.ts`, `src/lib/mail/password-reset-email.ts`, `src/lib/mail/__tests__/` entries for the deleted files

**Interfaces:**
- Consumes: `renderTemplate`, `TemplateName` (Task 3); `sendMail`, `MailMessage` (Task 4).
- Produces:
  - `resetPasswordMessage(i: { to: string; resetUrl: string; expiresInMinutes: number }): MailMessage`
  - `welcomeMessage(i: { to: string; name: string | null; setPasswordUrl: string; expiresInMinutes: number }): MailMessage`
  - `passwordChangedMessage(i: { to: string; changedAt: Date; byAdmin: boolean }): MailMessage`

- [ ] **Step 1: Write the failing test**

Create `src/lib/mail/__tests__/messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { passwordChangedMessage, resetPasswordMessage, welcomeMessage } from "@/lib/mail/messages";

describe("resetPasswordMessage", () => {
  it("carries the link in both bodies", () => {
    const m = resetPasswordMessage({ to: "u@x.test", resetUrl: "https://x.test/r/abc", expiresInMinutes: 30 });
    expect(m.html).toContain("https://x.test/r/abc");
    expect(m.text).toContain("https://x.test/r/abc");
    expect(m.subject).toBe("Restablece tu contraseña");
  });

  it("pluralizes the expiry in Spanish", () => {
    expect(resetPasswordMessage({ to: "u@x.test", resetUrl: "https://x.test/r", expiresInMinutes: 1 }).text)
      .toContain("1 minuto");
    expect(resetPasswordMessage({ to: "u@x.test", resetUrl: "https://x.test/r", expiresInMinutes: 30 }).text)
      .toContain("30 minutos");
  });
});

describe("welcomeMessage", () => {
  it("carries a set-password link and never a password", () => {
    const m = welcomeMessage({
      to: "u@x.test",
      name: "Ana",
      setPasswordUrl: "https://x.test/set/abc",
      expiresInMinutes: 60,
    });
    expect(m.html).toContain("https://x.test/set/abc");
    expect(m.html).toContain("Ana");
    // Mailing a working password puts a live credential in an inbox forever.
    expect(m.html.toLowerCase()).not.toContain("contraseña temporal");
  });

  it("reads correctly when the user has no name", () => {
    const m = welcomeMessage({ to: "u@x.test", name: null, setPasswordUrl: "https://x.test/s", expiresInMinutes: 60 });
    expect(m.html).toContain("Se creó una cuenta");
  });
});

describe("passwordChangedMessage", () => {
  it("distinguishes an admin reset from a self-service change", () => {
    const at = new Date("2026-09-04T15:00:00Z");
    expect(passwordChangedMessage({ to: "u@x.test", changedAt: at, byAdmin: true }).html)
      .toContain("administrador");
    expect(passwordChangedMessage({ to: "u@x.test", changedAt: at, byAdmin: false }).html)
      .not.toContain("administrador");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run src/lib/mail/__tests__/messages.test.ts`
Expected: FAIL with `Cannot find module '@/lib/mail/messages'`.

- [ ] **Step 3: Write the builders**

Create `src/lib/mail/messages.ts`:

```ts
import { renderTemplate } from "@/lib/mail/render";
import type { MailMessage } from "@/lib/mail/transport";

// The three messages this app sends, as pure functions of their data.
//
// Copy is inline Spanish rather than next-intl. next-intl resolves a locale from the request, and
// these messages are also built from paths that have no request: an admin creating a user, and any
// future scheduled send. A translator that works in one path and throws in another is worse than a
// fixed string, and es-CO is the product language anyway.

function expiry(minutes: number): string {
  return `${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
}

/** es-CO, no time zone shown: the reader's question is "was that me", not "which second". */
function spanishDate(value: Date): string {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeStyle: "short", timeZone: "America/Bogota" })
    .format(value);
}

export function resetPasswordMessage(input: {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
}): MailMessage {
  const window = expiry(input.expiresInMinutes);
  return {
    to: input.to,
    subject: "Restablece tu contraseña",
    html: renderTemplate("reset-password", { resetUrl: input.resetUrl, expiry: window }),
    text: [
      "Restablece tu contraseña",
      "",
      "Recibimos una solicitud para restablecer la contraseña de tu cuenta en Huella de Carbono CECODES.",
      "",
      "Abre este enlace para crear una nueva contraseña:",
      input.resetUrl,
      "",
      `El enlace vence en ${window} y solo se puede usar una vez.`,
      "",
      "Si no solicitaste el cambio, ignora este mensaje. Tu contraseña actual sigue siendo válida.",
    ].join("\n"),
  };
}

export function welcomeMessage(input: {
  to: string;
  name: string | null;
  setPasswordUrl: string;
  expiresInMinutes: number;
}): MailMessage {
  const window = expiry(input.expiresInMinutes);
  const greeting = input.name ? `Hola ${input.name}: se creó` : "Se creó";
  return {
    to: input.to,
    subject: "Tu cuenta en Huella de Carbono CECODES",
    html: renderTemplate("welcome", {
      name: input.name,
      email: input.to,
      setPasswordUrl: input.setPasswordUrl,
      expiry: window,
    }),
    text: [
      "Tu cuenta en Huella de Carbono",
      "",
      `${greeting} una cuenta para ti en Huella de Carbono CECODES.`,
      `Tu usuario es ${input.to}.`,
      "",
      "Define tu contraseña con este enlace:",
      input.setPasswordUrl,
      "",
      `El enlace vence en ${window}. Si vence, pide uno nuevo desde "Olvidé mi contraseña".`,
    ].join("\n"),
  };
}

export function passwordChangedMessage(input: {
  to: string;
  changedAt: Date;
  byAdmin: boolean;
}): MailMessage {
  const when = spanishDate(input.changedAt);
  const how = input.byAdmin ? "fue restablecida por un administrador de CECODES" : "se cambió";
  return {
    to: input.to,
    subject: "Tu contraseña cambió",
    html: renderTemplate("password-changed", { changedAt: when, byAdmin: input.byAdmin }),
    text: [
      "Tu contraseña cambió",
      "",
      `La contraseña de tu cuenta en Huella de Carbono CECODES ${how} el ${when}.`,
      "Todas las sesiones abiertas se cerraron, así que tendrás que ingresar de nuevo.",
      "",
      "Si no fuiste tú, escribe a CECODES de inmediato: alguien más tiene acceso a tu cuenta.",
    ].join("\n"),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run src/lib/mail/__tests__/messages.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Point the reset action at the new builder**

In `src/features/auth/actions/auth-actions.ts`, replace the import of `passwordResetEmail` and `sendMail` with:

```ts
import { sendMail } from "@/lib/mail/transport";
import { passwordChangedMessage, resetPasswordMessage } from "@/lib/mail/messages";
```

and replace the construct-then-send pair inside `requestPasswordResetAction` with:

```ts
      await sendMail(resetPasswordMessage({ to: normalized, resetUrl, expiresInMinutes }));
```

In `resetPasswordWithTokenAction` and `updatePasswordAction`, after the transaction that changes the password commits, add:

```ts
    // Fire and forget, after the commit. A user whose password was changed without their knowledge
    // finds out from this message, so it is worth sending even when the transport is down: sendMail
    // never throws, and a failure here must not fail a password change that already succeeded.
    await sendMail(passwordChangedMessage({ to: user.email, changedAt: new Date(), byAdmin: false }));
```

- [ ] **Step 6: Send the welcome and admin-reset messages**

In `src/features/admin/actions/user-actions.ts`:

- In `createUser`, after the transaction commits, issue a password reset token for the new user through the same helper `requestPasswordResetAction` uses, and send `welcomeMessage({ to: email, name: name ?? null, setPasswordUrl, expiresInMinutes })`.
- In `resetUserPassword`, after the transaction commits, send `passwordChangedMessage({ to: target.email, changedAt: new Date(), byAdmin: true })`.

Both sends are outside the transaction and both ignore the result, for the reason in Step 5.

- [ ] **Step 7: Delete the superseded files**

```bash
git rm src/lib/mail/send.ts src/lib/mail/password-reset-email.ts
git rm -r --ignore-unmatch src/lib/mail/__tests__/send.test.ts src/lib/mail/__tests__/password-reset-email.test.ts
```

- [ ] **Step 8: Verify**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: all pass. Any test that imported the deleted modules must be updated to the new ones, not deleted.

- [ ] **Step 9: Commit**

```bash
git add src/lib/mail/messages.ts src/lib/mail/__tests__/messages.test.ts src/features/auth/actions/auth-actions.ts src/features/admin/actions/user-actions.ts
git commit -m "feat(mail): welcome and password-changed messages, reset ported to templates"
```

---

# Phase 3: removing Supabase

Order inside this phase matters. The readers of `authProvider()` are removed first (Tasks 6 and 7), then the variable itself (Task 8). Doing it the other way round leaves the tree uncompilable between commits.

### Task 6: Collapse the identity seam

**Files:**
- Modify: `src/lib/auth/server.ts:11-17,30-55`
- Modify: `src/lib/auth/route-gate.ts`
- Modify: `src/proxy.ts`
- Delete: `src/lib/supabase/middleware.ts`, `src/lib/supabase/__tests__/middleware.test.ts`, `src/lib/supabase/server.ts`
- Test: `src/lib/auth/__tests__/server.test.ts`, `src/lib/auth/__tests__/route-gate.test.ts`

**Interfaces:**
- Consumes: `SESSION_COOKIE`, `readSession` from `src/lib/auth/session.ts`; `decideRoute`, `isAuthPage`, `isPublicPath`, `GateDecision` from `src/lib/auth/route-gate.ts`.
- Produces: `export async function gate(request: NextRequest): Promise<NextResponse>` in `src/lib/auth/route-gate.ts`, replacing `updateSession` from the deleted middleware. Task 9 (Dockerfile/compose) does not depend on it; `src/proxy.ts` does.

- [ ] **Step 1: Update the seam test first**

In `src/lib/auth/__tests__/server.test.ts`, delete every case that stubs `@/lib/supabase/server` and keep or add these, which describe the only behaviour left:

```ts
it("AUTH-22 resolves a forged cookie value to null", async () => {
  const { getUser } = await import("@/lib/auth/server");
  cookieValue = "not-a-real-token";
  expect(await getUser()).toBeNull();
});

it("AUTH-23 resolves an absent cookie to null", async () => {
  const { getUser } = await import("@/lib/auth/server");
  cookieValue = undefined;
  expect(await getUser()).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/lib/auth/__tests__/server.test.ts`
Expected: FAIL, because `getUser` still branches on `authProvider()` and the Supabase mock is gone.

- [ ] **Step 3: Collapse `getUser`**

In `src/lib/auth/server.ts`, remove the `createClient` and `authProvider` imports and replace the body of `getUser`:

```ts
/**
 * The current authenticated user, or null. The one place a cookie becomes an identity.
 *
 * Memoized per request: the shell layout, the admin layout, the page and each action all ask for
 * it, and one lookup is enough.
 */
export const getUser = cache(async (): Promise<AuthUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return readSession(token);
});
```

Leave `requireUser`, `getAppUser`, `requireAppUser`, `requireAdmin` and `companyIsActive` untouched.

- [ ] **Step 4: Move the gate into the auth module**

Copy `applyDecision`, `hasLocalSession` and `gateLocal` from `src/lib/supabase/middleware.ts` into `src/lib/auth/route-gate.ts` verbatim, keeping every comment including the redirect cookie-preservation note. Rename `gateLocal` to `gate` and export it. Do NOT copy `gateSupabase` or `updateSession`.

Keep the fail-closed 503 behaviour: if the gate cannot determine a decision because configuration is missing, it returns 503, never `NextResponse.next()`.

- [ ] **Step 5: Repoint the proxy**

Replace `src/proxy.ts` entirely:

```ts
import { type NextRequest } from "next/server";
import { gate } from "@/lib/auth/route-gate";

// Next.js 16 "proxy" convention (formerly middleware). Applies the route gate per request.
export async function proxy(request: NextRequest) {
  return await gate(request);
}

export const config = {
  matcher: [
    // Run on everything except Next internals, static assets, and the health probes.
    //
    // The health routes are excluded because the gate would redirect an unauthenticated probe to
    // /login, so an orchestrator would read a 307 instead of the real status.
    "/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 6: Delete the Supabase middleware and server client**

```bash
git rm src/lib/supabase/middleware.ts src/lib/supabase/server.ts src/lib/supabase/__tests__/middleware.test.ts
```

Move any still-relevant gate assertions out of the deleted test file into `src/lib/auth/__tests__/route-gate.test.ts` before deleting it.

- [ ] **Step 7: Verify**

Run: `bunx vitest run src/lib/auth && bun run typecheck`
Expected: PASS. `typecheck` will still fail on `user-actions.ts` and `auth-actions.ts`, which Task 7 fixes; confirm the only errors are in those two files.

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth/server.ts src/lib/auth/route-gate.ts src/proxy.ts src/lib/auth/__tests__/server.test.ts src/lib/auth/__tests__/route-gate.test.ts
git commit -m "refactor(auth): one identity source, one route gate"
```

---

### Task 7: Strip the Supabase branches from the actions

**Files:**
- Modify: `src/features/auth/actions/auth-actions.ts:6,9,136,151-170,329-340,371-400,520,685-690,880-885`
- Modify: `src/features/admin/actions/user-actions.ts:12,15,135,172-180,346-360,427-455`
- Modify: `src/features/auth/lib/errors.ts`
- Modify: `src/features/auth/components/reset-password-screen.tsx`
- Delete: `src/app/auth/callback/route.ts`, `src/app/auth/confirm/route.ts`, `src/lib/supabase/admin.ts`
- Test: `src/features/auth/actions/__tests__/*.test.ts`, `src/features/admin/actions/__tests__/local-user-admin.test.ts`

**Interfaces:**
- Consumes: `sendMail`, message builders (Task 5); session helpers `createSession`, `destroySession`, `destroyAllSessionsForUser` from `src/lib/auth/session.ts`.
- Produces: `isEmailInUse(error: unknown): boolean` in `src/features/auth/lib/errors.ts`, now taking an unknown Prisma error rather than a Supabase `AuthError`. Task 11 references it.

- [ ] **Step 1: Rewrite the error predicate test**

In `src/features/auth/lib/__tests__/errors.test.ts` (create it if absent):

```ts
import { describe, expect, it } from "vitest";
import { isEmailInUse } from "@/features/auth/lib/errors";

describe("isEmailInUse", () => {
  it("AUTH-47 recognises a Prisma unique violation on email", () => {
    // P2002 is Prisma's unique constraint failure. The meta.target names the field, which is what
    // separates "this email is taken" from any other unique index on the table.
    const error = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: { target: ["email"] },
    });
    expect(isEmailInUse(error)).toBe(true);
  });

  it("does not treat a unique violation on another column as an email clash", () => {
    const error = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: { target: ["tokenHash"] },
    });
    expect(isEmailInUse(error)).toBe(false);
  });

  it("returns false for anything else", () => {
    expect(isEmailInUse(new Error("boom"))).toBe(false);
    expect(isEmailInUse(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/features/auth/lib/__tests__/errors.test.ts`
Expected: FAIL, because `isEmailInUse` still takes `AuthError | null` and reads `.code === "user_already_exists"`.

- [ ] **Step 3: Rewrite the predicate**

Replace `src/features/auth/lib/errors.ts` entirely:

```ts
// True when a write failed because the email is already registered.
//
// Previously this matched GoTrue error codes and five English message substrings, which was the
// only way to ask an HTTP API. With the credential in our own table it is a unique constraint, and
// Prisma reports that as P2002 with the offending field in meta.target.
//
// Deliberately typed `unknown`: the caller has a caught error, not a Prisma error instance, and
// narrowing here rather than at each call site keeps the check in one place.
export function isEmailInUse(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== "P2002") return false;

  const target = candidate.meta?.target;
  // meta.target is string[] for a compound index and string for a single column, depending on the
  // connector. Both shapes have to answer the same way.
  if (Array.isArray(target)) return target.includes("email");
  return target === "email";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bunx vitest run src/features/auth/lib/__tests__/errors.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Collapse `auth-actions.ts`**

Six edits, each removing a branch and keeping the local body:

1. Delete the `createClient` import (line 6) and drop `authProvider` from the `@/lib/env` import (line 9).
2. `signInAction` (line 136): delete `if (authProvider() === "local") return await signInLocally(...)` and instead make `signInLocally`'s body the action's body. Delete lines 151-170 (the `signInWithPassword` call, the shadow verdict call and the `signOut`). Delete `recordShadowVerdict` and its helper entirely.
3. `signUpAction` (line 329): keep `return { error: "registrationDisabled" }` as the whole body and delete lines 334-360. Leave the exported name and the register screen in place; self-registration is closed by policy, not by deleting a route.
4. `requestPasswordResetAction` (line 371): unwrap the `if (authProvider() === "local") { ... }` block so its contents become the body, and delete the `else` branch containing `resetPasswordForEmail` (lines 395-400).
5. `resetPasswordWithTokenAction` (line 520): delete the `if (authProvider() !== "local") return { error: "invalidResetLink" }` guard.
6. `updatePasswordAction` (line 685): unwrap `updatePasswordLocally` into the action body and delete lines 687-690.
7. `signOutAction` (line 880): delete the `if (authProvider() === "local") return;` early return and the `supabase.auth.signOut()` that followed it, keeping the local session destruction that the early return used to skip.

Every throttle call keeps its exact position: checked before the password is verified, recorded on failure, cleared on success, and still not counting a correct password on a deactivated account.

- [ ] **Step 6: Collapse `user-actions.ts`**

1. Drop `authProvider` from the `@/lib/env` import (line 12) and delete the `@/lib/supabase/admin` import (line 15).
2. `createUser` (line 135): unwrap the `if (authProvider() === "local") { ... }` block; delete lines 172-180.
3. `resetUserPassword` (line 346): delete the `if (authProvider() !== "local") { ... }` block including lines 354-360.
4. `deleteUser` (line 427): delete both `if (authProvider() !== "local")` blocks including lines 432-435 and 452-455.

Every remaining write stays inside its `prisma.$transaction`, and every `updateMany`/`deleteMany` keeps its `{ count }` check.

- [ ] **Step 7: Delete the GoTrue landing routes and the admin client**

```bash
git rm src/app/auth/callback/route.ts src/app/auth/confirm/route.ts src/lib/supabase/admin.ts
```

Then grep `src/features/auth/components/reset-password-screen.tsx` for its Supabase reference and replace it with the local reset route the app already serves.

- [ ] **Step 8: Verify**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: all pass. Update `src/features/auth/actions/__tests__/*.test.ts` and `local-user-admin.test.ts` to drop their Supabase mocks; the existing local-path assertions should survive unchanged.

- [ ] **Step 9: Commit**

```bash
git add src/features/auth/actions/auth-actions.ts src/features/admin/actions/user-actions.ts src/features/auth/lib/errors.ts src/features/auth/lib/__tests__/errors.test.ts src/features/auth/components/reset-password-screen.tsx src/features/auth/actions/__tests__ src/features/admin/actions/__tests__
git commit -m "refactor(auth): actions talk only to Postgres"
```

---

### Task 7b: Prove every stored hash is portable before deleting the fallback

This runs before Task 8 because Task 8 removes the packages, and after that the evidence cannot be
gathered any more. It is the whole basis for the claim that removal is safe.

**Files:**
- Create: `scripts/audit-password-hashes.ts`
- Modify: `src/lib/auth/__tests__/password.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `verifyPassword` from `src/lib/auth/password.ts`.
- Produces: `bun run db:audit-hashes`, a read-only report. Nothing later depends on it in code.

- [ ] **Step 1: Add canonical bcrypt vectors to the password tests**

These are the published OpenBSD test vectors. They prove bcryptjs implements `$2a$` correctly,
which is what makes a format check sufficient for users whose passwords nobody knows.

```ts
import { describe, expect, it } from "vitest";
import { verifyPassword } from "@/lib/auth/password";

describe("bcrypt compatibility", () => {
  // From the OpenBSD bcrypt test suite. If any of these fail, hashes produced by GoTrue cannot be
  // trusted to verify here, and the migration is not safe at any cost factor.
  const VECTORS: Array<[password: string, hash: string]> = [
    ["", "$2a$06$DCq7YPn5Rq63x1Lad4cll.TV4S6ytwfsfvkgY8jIucDrjc8deX1s."],
    ["a", "$2a$06$m0CrhHm10qJ3lXRY.5zDGO3rS2KdeeWLuGmsfGlMfOxih58VYVfxe"],
    ["abc", "$2a$06$If6bvum7DFjUnE9p2uDeDu0YHzrHM6tf.iqN8.yx.jNN1ILEf7h0i"],
    ["abcdefghijklmnopqrstuvwxyz", "$2a$06$.rCVZVOThsIa97pEDOxvGuRRgzG64bvtJ0938xuqzv18d3ZpQhstC"],
    ["~!@#$%^&*()      ~!@#$%^&*()PNBFRD", "$2a$06$fPIsBO8qRqkjj273rfaOI.HtSV9jLDpTbZn782DC6/t7qT67P6FfO"],
  ];

  it.each(VECTORS)("AUTH-07 verifies the canonical $2a$ vector for %j", async (password, hash) => {
    expect(await verifyPassword(password, hash)).toBe(true);
  });

  it("AUTH-07 rejects a wrong password against a canonical vector", async () => {
    expect(await verifyPassword("wrong", VECTORS[2][1])).toBe(false);
  });

  it("AUTH-07 returns false rather than throwing on a malformed hash", async () => {
    // bcryptjs THROWS on a 60-character string that is not a valid hash. An exception here would
    // escape the sign-in action, answer differently for a real and an invented account, and skip
    // the throttle record. Both are handed to an attacker for free.
    for (const bad of ["", "not-a-hash", "$2a$12$tooshort", "x".repeat(60)]) {
      expect(await verifyPassword("anything", bad)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run to verify**

Run: `bunx vitest run src/lib/auth/__tests__/password.test.ts`
Expected: PASS. A failure here stops the migration; do not proceed to Task 8.

- [ ] **Step 3: Write the read-only audit**

Create `scripts/audit-password-hashes.ts`:

```ts
/**
 * Read-only. Asserts every stored credential is a well-formed bcrypt hash.
 *
 * This is the evidence that removing the Supabase fallback is safe for users whose passwords
 * nobody knows: bcrypt verification is deterministic and depends only on the hash string, so a
 * format audit plus the canonical vectors in password.test.ts covers every user rather than a
 * sample.
 *
 * It SELECTs and nothing else. It prints counts and never a hash, an id or an address.
 */
import { PrismaClient } from "../src/lib/generated/prisma/client";

const prisma = new PrismaClient();

// $2a$ is what GoTrue produced; $2b$ is what bcryptjs produces now. Both are 60 characters with a
// two-digit cost. Anything else cannot be verified and would lock its owner out silently.
const WELL_FORMED = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

const users = await prisma.appUser.findMany({ select: { passwordHash: true, active: true } });

let ok = 0;
let malformed = 0;
let missing = 0;
const costs = new Map<string, number>();

for (const user of users) {
  if (!user.passwordHash) {
    missing += 1;
    continue;
  }
  if (!WELL_FORMED.test(user.passwordHash)) {
    malformed += 1;
    continue;
  }
  ok += 1;
  const prefix = user.passwordHash.slice(0, 7); // "$2a$12$", the algorithm and cost only
  costs.set(prefix, (costs.get(prefix) ?? 0) + 1);
}

console.log(`users:            ${users.length}`);
console.log(`well-formed:      ${ok}`);
console.log(`missing hash:     ${missing}`);
console.log(`malformed hash:   ${malformed}`);
for (const [prefix, count] of [...costs].sort()) console.log(`  ${prefix}  ${count}`);

await prisma.$disconnect();

// A missing hash is survivable: that user resets their password. A malformed one is not, because
// it would be read as a credential and never match anything.
if (malformed > 0) {
  console.error("\nFAILED: malformed hashes present. Do not remove the Supabase fallback.");
  process.exit(1);
}
console.log("\nOK: every stored credential is verifiable bcrypt.");
```

- [ ] **Step 4: Add the script entry**

In `package.json` scripts:

```json
    "db:audit-hashes": "bun scripts/audit-password-hashes.ts",
```

- [ ] **Step 5: Run it against the live database**

Announce first. This is a read-only SELECT against production.

Run: `bun run db:audit-hashes`
Expected: `well-formed: 11`, `malformed: 0`, and every prefix a supported one. A non-zero
`malformed` count stops the migration here.

- [ ] **Step 6: Commit**

```bash
git add scripts/audit-password-hashes.ts src/lib/auth/__tests__/password.test.ts package.json
git commit -m "test(auth): prove bcryptjs verifies every stored hash before removing the fallback"
```

---

### Task 8: Remove the variable, the packages, and the seeds' dependency

**Files:**
- Modify: `src/lib/env.ts`
- Modify: `prisma/seed.ts`, `prisma/seed-demo.ts`
- Modify: `e2e/fixture.ts`, `e2e/global-setup.ts`
- Modify: `package.json`
- Test: `src/lib/__tests__/env.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `src/lib/env.ts` no longer exports `AuthProvider` or `authProvider`. Any remaining importer is a compile error, which is the point.

- [ ] **Step 1: Write the failing env test**

In `src/lib/__tests__/env.test.ts`, replace the Supabase cases with:

```ts
it("boots with no Supabase variables at all", () => {
  expect(() =>
    validateRuntimeEnv({
      DATABASE_URL: "postgresql://u:p@db:5432/cecodes",
      SITE_URL: "http://localhost:3000",
      MAIL_TRANSPORT: "smtp",
      SMTP_HOST: "mailpit",
      MAIL_FROM: "CECODES <no-reply@localhost>",
    }),
  ).not.toThrow();
});

it("init runs without ADMIN_PASSWORD, because init generates one", () => {
  expect(() =>
    validateInitEnv({
      DATABASE_URL: "postgresql://u:p@db:5432/cecodes",
      ADMIN_EMAIL: "admin@cecodes.local",
    }),
  ).not.toThrow();
});

it("still refuses an ADMIN_PASSWORD that was set but is too short", () => {
  expect(() =>
    validateInitEnv({
      DATABASE_URL: "postgresql://u:p@db:5432/cecodes",
      ADMIN_EMAIL: "admin@cecodes.local",
      ADMIN_PASSWORD: "short",
    }),
  ).toThrow(/ADMIN_PASSWORD/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run src/lib/__tests__/env.test.ts`
Expected: FAIL with `NEXT_PUBLIC_SUPABASE_URL is required`.

- [ ] **Step 3: Strip env.ts**

Delete from `src/lib/env.ts`: the `AUTH_PROVIDERS` array, `AuthProvider` type, `authProviderSchema`, the `AUTH_PROVIDER` field, `authProvider()`, the three `NEXT_PUBLIC_SUPABASE_*` and `SUPABASE_SERVICE_ROLE_KEY` fields, and the `initSchemaFor` branch that added the service role key. `initSchemaFor` collapses to a plain `runtimeSchema.extend({ ADMIN_EMAIL, ADMIN_PASSWORD })`.

Update `INIT_ENV_KEYS` to:

```ts
export const INIT_ENV_KEYS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "SITE_URL",
  "MAIL_TRANSPORT",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
] as const;
```

Rewrite the file's opening doc comment so it no longer describes a Supabase failure mode that cannot happen.

- [ ] **Step 4: Make the seeds Prisma-only**

In `prisma/seed.ts`: delete the `createSupabaseAdminClient` and `findAuthUserIdByEmail` imports, the `needsSupabase` variable and the whole `if (needsSupabase) { ... }` block. The admin becomes one `prisma.appUser.upsert` with `passwordHash` from `hashPassword(adminPassword)`, keeping the generated-password banner from Task 4 Step 9. Generate the id with `crypto.randomUUID()`.

In `prisma/seed-demo.ts`: same treatment. Keep the `DEMO_SEED_ALLOWED` production brake exactly as it is, and update its comment, which currently says "there is exactly one shared Supabase database", to say "one shared database".

- [ ] **Step 5: Make the E2E fixtures Prisma-only**

In `e2e/fixture.ts`: delete the `@supabase/supabase-js` import and `supabaseAdmin()`. `createUser` becomes a single `prisma.appUser.create` with a hashed password; the teardown becomes `prisma.appUser.delete`, whose cascades remove sessions and reset tokens. Delete the `ON CONFLICT` comment about the signup trigger, and in `e2e/global-setup.ts` delete the trigger-race workaround at lines 62-63, which the trigger's removal makes dead.

- [ ] **Step 6: Remove the packages**

```bash
bun remove @supabase/ssr @supabase/supabase-js
```

- [ ] **Step 7: Prove nothing is left (spec V6)**

```bash
grep -rn "supabase" src/ prisma/ e2e/ scripts/ --include=*.ts --include=*.tsx -i | grep -v "^.*://" || echo "no source references"
grep -c "@supabase" package.json || echo "no package references"
```

Expected: the only remaining hits are historical comments in migration files and `credential-backfill.ts`, which is retained deliberately.

- [ ] **Step 8: Verify**

Run: `bun run typecheck && bun run lint && bun run test && bun run build`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/env.ts src/lib/__tests__/env.test.ts prisma/seed.ts prisma/seed-demo.ts e2e/fixture.ts e2e/global-setup.ts package.json bun.lock
git commit -m "feat(auth): remove Supabase"
```

---

### Task 9: Images, compose and docs

**Files:**
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `AGENTS.md`, `IMPLEMENTATION.md`, `docs/DOCKER_DEPLOYMENT.md`

**Interfaces:**
- Consumes: the `db` service (Task 2) and `src/lib/mail/templates` (Task 3).
- Produces: a `mailpit` service on the internal network at host `mailpit`, SMTP port `1025`, HTTP API and UI on `8025`. Task 12's E2E spec depends on those names.

- [ ] **Step 1: Drop the build args from the Dockerfile**

In the `builder` stage, delete these four lines and the paragraph of comment above them that explains the build-time inlining problem, replacing the comment with a note that no environment-specific value is inlined any more:

```
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
```

- [ ] **Step 2: Copy the templates into the runner**

In the `runner` stage, after the `public` copy:

```dockerfile
# The .hbs email templates, read with fs at runtime. next.config.ts also lists them in
# outputFileTracingIncludes, and this line is the belt to that braces: a template missing from the
# image is discovered by a user who cannot reset their password, which is too late to find out.
COPY --from=builder --chown=node:node /app/src/lib/mail/templates ./src/lib/mail/templates
```

- [ ] **Step 3: Delete the build args from compose and add Mailpit**

Remove the `args:` block from the `app` service's `build:` section. Then add, after `db`:

```yaml
  # -------------------------------------------------------------------------------------------
  # mailpit - a mail server that catches everything and delivers nothing
  # -------------------------------------------------------------------------------------------
  # The default transport, so `docker compose up -d` gives a working password-reset flow with no
  # provider account. Read the messages at http://127.0.0.1:8025.
  #
  # A production deployment sets MAIL_TRANSPORT=resend and RESEND_API_KEY, at which point this
  # container simply sits idle, or is skipped with `--scale mailpit=0`.
  mailpit:
    image: axllent/mailpit:v1.31.0
    # BOTH ports bound to 127.0.0.1, never 0.0.0.0. The short form "1025:1025" would publish an
    # open relay to the internet on a VPS, which is found by scanners within hours.
    #
    # SMTP is published at all because `bun run dev` and the Playwright suite run on the HOST, not
    # inside this network, and the reset spec needs somewhere to deliver. Containers reach it as
    # mailpit:1025 and ignore this mapping.
    ports:
      - "127.0.0.1:1025:1025"
      - "127.0.0.1:8025:8025"
    environment:
      MP_MAX_MESSAGES: 500
      MP_SMTP_AUTH_ACCEPT_ANY: 1
      MP_SMTP_AUTH_ALLOW_INSECURE: 1
    restart: unless-stopped
    networks: [internal]
```

Add `mailpit` to the `app` service's `depends_on` with `condition: service_started`.

- [ ] **Step 4: Rewrite the compose header comment**

The header currently says there is no database service on purpose and that Supabase provides authentication. Replace that paragraph with an accurate one: four containers by default, the database is a container with a named volume, mail goes to Mailpit unless `MAIL_TRANSPORT=resend`, and `DATABASE_URL` can point at any Postgres.

- [ ] **Step 5: Rewrite `.env.example`**

Remove every `NEXT_PUBLIC_SUPABASE_*` and `SUPABASE_SERVICE_ROLE_KEY` line and every `AUTH_PROVIDER` line. Add `MAIL_TRANSPORT`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`. Keep the `docker run --env-file` quote-trap note. State at the top that every variable has a working default and the file is only needed to override them.

- [ ] **Step 6: Correct the docs**

- `AGENTS.md`: the locked-stack line becomes `Postgres + self-hosted auth` instead of `Supabase Postgres + Auth`. Delete the "Never call Supabase from the browser" rule, which is now moot, and replace it with the rule that survives it: no database client may exist in browser code.
- `IMPLEMENTATION.md` section 8: keep the statement that RLS is inert and that `company-scope.ts` is the boundary. Replace the description of Supabase Auth with the session table, and note that `private.current_app_user_id()` reads a session setting nothing currently sets.
- `docs/DOCKER_DEPLOYMENT.md`: delete the requirement for a Supabase project. Document the four services, the generated admin password, and the Mailpit inbox URL.

- [ ] **Step 7: Verify the image builds and the stack runs**

Announce first, then:

```bash
docker compose build && docker compose config >/dev/null && echo OK
```

- [ ] **Step 8: Commit**

```bash
git add Dockerfile docker-compose.yml .env.example AGENTS.md IMPLEMENTATION.md docs/DOCKER_DEPLOYMENT.md
git commit -m "feat(docker): one image, any environment, with mail included"
```

---

# Phase 4: proving auth coverage

### Task 10: The register and the gate

**Files:**
- Create: `docs/auth/USE-CASES.md`
- Create: `src/lib/auth/__tests__/use-case-coverage.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the register file at that exact path, with ids matching `/^- (AUTH-\d{2}) /` at line start. Task 11 adds tests that satisfy it.

- [ ] **Step 1: Write the register**

Create `docs/auth/USE-CASES.md` containing the fifty-four cases exactly as listed in the spec's Part 5, under the same eight headings, one per line in the form `- AUTH-01 <behaviour>`. Add a preamble explaining that the gate test parses this file and that adding a line without a test breaks the build.

- [ ] **Step 2: Write the failing gate**

Create `src/lib/auth/__tests__/use-case-coverage.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The gate that turns "100% of auth use cases are covered" from a claim into a build failure.
//
// It proves a registered case was considered and exercised. It does NOT prove the assertion behind
// it is strong; that is what review is for. The pairing is checkable because each id sits in a test
// name next to the assertion it describes.

const REGISTER = "docs/auth/USE-CASES.md";
const ID = /\bAUTH-\d{2}\b/g;

function walk(dir: string, match: (file: string) => boolean, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    // node_modules and build output hold no tests and make this walk take seconds.
    if (entry === "node_modules" || entry === ".next" || entry === "generated") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, match, out);
    else if (match(entry)) out.push(full);
  }
  return out;
}

describe("auth use-case coverage", () => {
  it("every registered case is named by at least one test", () => {
    const registered = new Set(readFileSync(REGISTER, "utf8").match(ID) ?? []);
    expect(registered.size).toBeGreaterThan(0);

    const files = [
      ...walk("src", (f) => f.endsWith(".test.ts")),
      ...walk("e2e", (f) => f.endsWith(".spec.ts")),
    ].filter((f) => !f.endsWith("use-case-coverage.test.ts"));

    const covered = new Set<string>();
    for (const file of files) {
      for (const id of readFileSync(file, "utf8").match(ID) ?? []) covered.add(id);
    }

    const missing = [...registered].filter((id) => !covered.has(id)).sort();
    expect(missing, `Registered in ${REGISTER} but named by no test`).toEqual([]);
  });

  it("every id named by a test is registered", () => {
    // The other direction, so a renamed case cannot leave an orphan test claiming coverage of an
    // id that no longer describes anything.
    const registered = new Set(readFileSync(REGISTER, "utf8").match(ID) ?? []);
    const files = [
      ...walk("src", (f) => f.endsWith(".test.ts")),
      ...walk("e2e", (f) => f.endsWith(".spec.ts")),
    ].filter((f) => !f.endsWith("use-case-coverage.test.ts"));

    const orphans = new Set<string>();
    for (const file of files) {
      for (const id of readFileSync(file, "utf8").match(ID) ?? []) {
        if (!registered.has(id)) orphans.add(id);
      }
    }

    expect([...orphans].sort(), `Named by a test but absent from ${REGISTER}`).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it to see exactly which cases are uncovered**

Run: `bunx vitest run src/lib/auth/__tests__/use-case-coverage.test.ts`
Expected: FAIL, listing the ids with no test. Record that list; it is Task 11's work queue.

- [ ] **Step 4: Commit the register and the failing gate**

```bash
git add docs/auth/USE-CASES.md src/lib/auth/__tests__/use-case-coverage.test.ts
git commit -m "test(auth): register every auth use case and gate on it"
```

Committing a failing gate is deliberate here: the next task's definition of done is making it pass, and a reviewer can see the gap.

---

### Task 11: Close the coverage gap

**Files:**
- Modify: every file under `src/lib/auth/__tests__/`, `src/features/auth/actions/__tests__/`, `src/features/admin/actions/__tests__/`
- Modify: `vitest.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: the failing id list from Task 10 Step 3.
- Produces: a passing gate and enforced thresholds.

- [ ] **Step 1: Name the ids on tests that already exist**

For every id whose behaviour is already asserted somewhere, prefix that test's name with the id. Do not write a new test for behaviour already covered. Example:

```ts
it("AUTH-05 refuses a correct password on a deactivated user without counting it", async () => {
```

- [ ] **Step 2: Rerun the gate to get the true gap**

Run: `bunx vitest run src/lib/auth/__tests__/use-case-coverage.test.ts`
Expected: a shorter failing list. These are the genuinely untested cases.

- [ ] **Step 3: Write the missing tests, one id at a time**

For each remaining id, write the test, run it, watch it fail for the right reason, then confirm it passes. The three most likely to be missing, with their shapes:

```ts
it("AUTH-04 spends a bcrypt comparison on an unknown email", async () => {
  // Without this the response time separates "no such account" from "wrong password", which is an
  // enumeration oracle that costs an attacker nothing to read.
  const compare = vi.spyOn(bcrypt, "compare");
  await signInAction({ email: "nobody@x.test", password: "whatever" });
  expect(compare).toHaveBeenCalledTimes(1);
});

it("AUTH-18 stores only the SHA-256 of a session token", async () => {
  const token = await createSession({ id: "u1", email: "u@x.test" }, {});
  const rows = await prisma.userSession.findMany();
  expect(rows[0].tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
  expect(rows.some((r) => JSON.stringify(r).includes(token))).toBe(false);
});

it("AUTH-36 revokes every session and sibling token when a reset is consumed", async () => {
  // A reset exists because the account may be compromised. Leaving the attacker's session alive is
  // the one outcome that makes the whole flow pointless.
  await resetPasswordWithTokenAction({ token, password: "nueva-clave-larga" });
  expect(await prisma.userSession.count({ where: { userId } })).toBe(0);
  expect(await prisma.passwordResetToken.count({ where: { userId, consumedAt: null } })).toBe(0);
});
```

- [ ] **Step 4: Run the gate until it passes**

Run: `bunx vitest run src/lib/auth/__tests__/use-case-coverage.test.ts`
Expected: PASS, both directions.

- [ ] **Step 5: Add coverage thresholds**

```bash
bun add -d @vitest/coverage-v8
```

In `vitest.config.ts`, add to `test`:

```ts
    coverage: {
      provider: "v8",
      // Scoped to auth and mail, with no global threshold. A repo-wide 100% would make unrelated
      // work miserable and would be gamed within a week; these four paths are the ones where an
      // uncovered branch is a security bug rather than a gap.
      include: [
        "src/lib/auth/**",
        "src/features/auth/**",
        "src/lib/mail/**",
        "src/features/admin/actions/user-actions.ts",
      ],
      exclude: ["**/__tests__/**", "src/features/auth/components/**", "src/features/auth/hooks/**"],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
```

Add to `package.json` scripts:

```json
    "test:coverage": "vitest run --coverage",
```

- [ ] **Step 6: Run coverage and close what it finds**

Run: `bun run test:coverage`
Expected: initially FAIL, naming uncovered lines. Add tests for each until it passes. If a line is genuinely unreachable, add an `/* v8 ignore next */` comment with a sentence saying why; do not lower a threshold.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/__tests__ src/features/auth/actions/__tests__ src/features/auth/lib/__tests__ src/features/admin/actions/__tests__ src/lib/mail/__tests__ vitest.config.ts package.json bun.lock
git commit -m "test(auth): cover every registered use case and pin the thresholds"
```

---

# Phase 5: end-to-end verification

### Task 12: The Mailpit reset loop

**Files:**
- Create: `e2e/password-reset.spec.ts`
- Modify: `playwright.config.ts` (env for the web server)

**Interfaces:**
- Consumes: the `mailpit` service (Task 9), the reset flow (Tasks 5 and 7).
- Produces: nothing later depends on it.

- [ ] **Step 1: Write the spec**

Create `e2e/password-reset.spec.ts`:

```ts
import { expect, test, type APIRequestContext } from "@playwright/test";
import { E2E_EMAIL_DOMAIN, E2E_PASSWORD, createE2EUser, db, deleteE2EUser } from "./fixture";

// The only test that proves rendering, transport, delivery and consumption together. Everything
// else in the suite stops at "we handed it to the transport".
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";

type MailpitMessage = { ID: string };

/** Polls, because delivery is asynchronous and a fixed sleep is either flaky or slow. */
async function waitForMessage(request: APIRequestContext, to: string): Promise<MailpitMessage> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    if (response.ok()) {
      const body = (await response.json()) as { messages: MailpitMessage[] };
      if (body.messages?.length) return body.messages[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("no message arrived within 15s");
}

test("AUTH-32 AUTH-35 AUTH-37 a reset link arrives, works once, and replaces the old password", async ({
  page,
  request,
}) => {
  // createE2EUser always provisions E2E_PASSWORD, so that is the "before" password here. The
  // address stays inside the suite's own namespace so global-teardown reclaims it.
  const email = `e2e-reset-${Date.now()}@${E2E_EMAIL_DOMAIN}`;
  const replacement = "Clave-Nueva-456789!";
  const client = await db();
  const id = await createE2EUser(client, email);

  try {
    await request.delete(`${MAILPIT}/api/v1/messages`);

    await page.goto("/forgot-password");
    await page.getByLabel(/correo/i).fill(email);
    await page.getByRole("button", { name: /enviar|restablecer/i }).click();

    const message = await waitForMessage(request, email);
    const raw = (await (await request.get(`${MAILPIT}/api/v1/message/${message.ID}`)).json()) as {
      Text: string;
    };
    const link = raw.Text.match(/https?:\/\/\S+/)?.[0];
    expect(link, "the message must carry an absolute link").toBeTruthy();

    // AUTH-35: the origin comes from SITE_URL, not from the request's Host header. A Host-derived
    // link is host-header injection: an attacker requests a reset for someone else's account and
    // the real user is mailed a real token pointing at the attacker's site.
    expect(link!.startsWith(process.env.SITE_URL ?? "http://127.0.0.1:3000")).toBe(true);

    await page.goto(link!);
    await page.getByLabel(/contraseña/i).first().fill(replacement);
    await page.getByRole("button", { name: /guardar|cambiar|crear/i }).click();

    await page.goto("/login");
    await page.getByLabel(/correo/i).fill(email);
    await page.getByLabel(/contraseña/i).fill(replacement);
    await page.getByRole("button", { name: /ingresar|iniciar/i }).click();
    await expect(page).not.toHaveURL(/\/login/);

    // AUTH-37: the token is single use. Following it again must not offer a second change.
    await page.goto(link!);
    await expect(page.getByText(/inválido|vencido|expirado/i)).toBeVisible();
  } finally {
    await deleteE2EUser(client, id, email);
    await client.end();
  }
});
```

Note the fixture signatures, which differ from the obvious guess: `db()` returns a `pg` `Client`,
`createE2EUser(client, email, options?)` returns the id and always provisions `E2E_PASSWORD`, and
`deleteE2EUser(client, id, email)` takes all three.

- [ ] **Step 2: Give Playwright the Mailpit address**

`playwright.config.ts` has a `webServer` block with no `env` key, so add one. The dev server it
starts otherwise inherits only what `loadEnvConfig` found, which will not name a transport:

```ts
  webServer: {
    command: "bun run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // Turbopack plus the React Compiler makes a cold start slow.
    timeout: 180_000,
    env: {
      // Mailpit is reached from the host here, not from inside the compose network, so this is
      // 127.0.0.1 rather than the service name the app containers use.
      MAIL_TRANSPORT: "smtp",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "1025",
      MAIL_FROM: "CECODES <no-reply@localhost>",
      // Pinned, because the reset spec asserts the emailed link starts with it.
      SITE_URL: BASE_URL,
    },
  },
```

- [ ] **Step 3: Run it**

Announce first (it needs Mailpit running), then:

```bash
docker compose up -d mailpit
bunx playwright test e2e/password-reset.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/password-reset.spec.ts playwright.config.ts
git commit -m "test(e2e): prove the reset mail is rendered, delivered and single-use"
```

---

### Task 13: The one-click proof

**Files:** none. This task produces evidence, not code.

- [ ] **Step 1: Full static gate**

Run: `bun run typecheck && bun run lint && bun run test:coverage && bun run build`
Expected: all pass, coverage thresholds met.

- [ ] **Step 2: Schema drift check**

Run: `bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
Expected: an empty migration.

- [ ] **Step 3: The actual one-click test (spec V2)**

Announce first. Move any local env files aside so the run is genuinely unconfigured:

```bash
mv .env .env.bak 2>/dev/null; mv .env.local .env.local.bak 2>/dev/null
docker compose down -v
docker compose up -d --build
docker compose logs init
```

Expected: the init log shows the bootstrap, migrations, the seed, and the ADMIN ACCOUNT CREATED banner with a generated password. `docker compose ps` shows `app` healthy.

- [ ] **Step 4: Sign in as the generated admin (spec V3)**

Open `http://127.0.0.1:3000`, sign in with `admin@cecodes.local` and the password from the log. Confirm `/admin` renders with live data.

- [ ] **Step 5: Prove restart idempotency**

```bash
docker compose restart
docker compose logs --tail=40 init
```

Expected: init does not re-run (it already completed), the app returns healthy, and no second admin banner appears.

- [ ] **Step 6: Full Playwright suite against the stack (spec V4)**

Run: `bun run test:e2e`
Expected: the same pass count as the last green run, plus the new reset spec.

- [ ] **Step 7: Drive the app by hand (spec V8)**

Sign in, enter data on one Scope 2 month and one Scope 1 annual row, open the dashboard, and download one report. Confirm totals render in tonnes.

- [ ] **Step 8: Restore the local environment and tear down**

```bash
docker compose down
mv .env.bak .env 2>/dev/null; mv .env.local.bak .env.local 2>/dev/null
```

- [ ] **Step 9: Record the evidence**

Append a short "Verified on 2026-09-04" section to `docs/DOCKER_DEPLOYMENT.md` listing what was run and what it produced. Commit:

```bash
git add docs/DOCKER_DEPLOYMENT.md
git commit -m "docs: record the one-click deployment verification"
```

---

# Phase 6: the data migration runbook

### Task 14: Moving off Supabase-hosted Postgres, when the user chooses to

**Files:**
- Create: `docs/DATA-MIGRATION.md`

**Interfaces:**
- Consumes: the `db` service and `pgdata` volume (Task 2).
- Produces: documentation only. This task does NOT run against production.

- [ ] **Step 1: Write the runbook**

Create `docs/DATA-MIGRATION.md` with these seven sections and exactly these commands.

**1. What moves.** The whole `public` schema. What does not: the `auth` schema, which stays on
Supabase untouched as the rollback, and which the bootstrap recreates empty on the target.

**2. Prepare the target first.** The ledger and the RLS objects must exist before any data lands,
or `pg_restore` fails on missing roles and functions:

```bash
export TARGET="postgresql://cecodes:cecodes-local-dev@127.0.0.1:5432/cecodes"
DIRECT_URL="$TARGET" bun run db:bootstrap
DIRECT_URL="$TARGET" bunx prisma migrate deploy
```

**3. Dump the source.** `pg_dump` only reads, so this is safe to rehearse against production:

```bash
export SOURCE="<the DIRECT_URL from .env.local>"
pg_dump "$SOURCE" --format=custom --no-owner --no-privileges --schema=public --file=cecodes.dump
```

**4. Restore.** `--no-owner` and `--no-privileges` matter: the Supabase roles (`supabase_admin`,
`anon`, `service_role`) do not exist on the target, and without these flags every `ALTER ... OWNER
TO` fails. `--data-only` because step 2 already created the schema:

```bash
pg_restore --dbname="$TARGET" --no-owner --no-privileges --data-only --disable-triggers cecodes.dump
```

**5. Verify row counts.** Run the identical query against both and diff the output. A count that
differs by even one row means stop:

```bash
QUERY="SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY relname;"
psql "$SOURCE" -At -c "$QUERY" > counts-source.txt
psql "$TARGET" -At -c "ANALYZE; $QUERY" > counts-target.txt
diff counts-source.txt counts-target.txt && echo "row counts match"
```

**6. Cut over.** Stop the app so nothing writes during the final dump, repeat steps 3 to 5, then
repoint and start:

```bash
docker compose stop app
# repeat steps 3-5 against a freshly emptied target
docker compose up -d          # with DATABASE_URL now naming the target in .env
```

Sign in, open the dashboard, and download one report before telling anyone it is done.

**7. Rollback.** Put the old `DATABASE_URL` back in `.env` and `docker compose up -d`. Nothing on
Supabase was modified at any point, so the rollback is complete rather than partial.

- [ ] **Step 2: Rehearse it against a scratch container**

Announce first. Run the whole runbook end to end using the throwaway Postgres from Task 1 as the *target* and a second throwaway container seeded by `verify-fresh-db.ts` as the *source*. Never point the source at the live database during rehearsal.

Expected: row counts match, and the app starts against the restored database.

- [ ] **Step 3: Fix whatever the rehearsal proved wrong, then commit**

```bash
git add docs/DATA-MIGRATION.md
git commit -m "docs: runbook for moving the database off Supabase hosting"
```

---

## Definition of done

- `docker compose up -d` on a clean clone with no `.env` yields a healthy app, a seeded database and a working password reset through Mailpit.
- `grep -ri supabase src/ prisma/ e2e/ scripts/` returns only historical comments and the retained backfill script.
- `bun run test:coverage` passes with 100% thresholds on auth and mail, and the use-case gate passes in both directions.
- The full Playwright suite passes, including `e2e/password-reset.spec.ts`.
- `docs/DATA-MIGRATION.md` has been rehearsed, and production data has not been touched.
