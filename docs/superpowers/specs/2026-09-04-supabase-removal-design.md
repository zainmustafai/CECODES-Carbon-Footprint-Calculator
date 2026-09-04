# Removing Supabase, one-click deployment, and provable auth coverage

Date: 2026-09-04
Status: approved by the user on 2026-09-04, pending spec review

## Goal

Four outcomes, in one shipment:

1. **No Supabase.** No `@supabase/*` package, no `src/lib/supabase/`, no `NEXT_PUBLIC_SUPABASE_*`
   build argument, no GoTrue call on any path. Zero data lost.
2. **One click.** `git clone && docker compose up -d`, with no `.env` written by hand, yields a
   working seeded system including its own database.
3. **Real email.** Handlebars `.hbs` templates, Mailpit for development and test, Resend for
   production, chosen by one variable.
4. **Provable auth coverage.** A register of auth use cases, and a test that fails the build when a
   registered case has no test.

## Non-goals

- Moving production data off Supabase-hosted Postgres. The runbook is written and tested in this
  work; running it against production is a separate, user-initiated act.
- Any change to `src/lib/auth/company-scope.ts`. It is the authorization boundary and this work
  does not touch it.
- Making RLS load-bearing. Prisma connects as the table owner and bypasses every policy. That was
  true before and stays true.

## Context

`AUTH_PROVIDER` already exists with three modes and the local path is already built: password
hashing (`src/lib/auth/password.ts`), opaque sessions (`session.ts`), the route gate
(`route-gate.ts`), the credential backfill, and a Resend sender. The full Playwright suite has
passed with `AUTH_PROVIDER=local` (64 passed, 8 skipped). What remains is deleting the other two
modes, giving the system a database and a mail server of its own, and proving the result.

---

## Part 1: the fresh-database blocker

### The problem

The migration chain cannot replay onto a virgin Postgres. `prisma migrate deploy` runs all twenty
migrations from empty, and the second one, `20260709120320_rls_and_auth`, needs three objects that
only Supabase provides:

| Line | Statement | Requires |
| --- | --- | --- |
| 18, 31 | `private.current_company_id()` and `private.is_admin()` bodies call `auth.uid()` | `auth.uid()` to exist. Postgres validates a `LANGUAGE sql` body at CREATE time. |
| 38-39 | `GRANT EXECUTE ... TO authenticated` | the `authenticated` role |
| 59-61 | `CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users` | the `auth.users` relation |

`CREATE ROLE authenticated` appears only in migration twenty of twenty
(`20260905120100_rls_session_identity`). Migrations `20260709120322` and `20260709120323` reference
`auth.uid()` as well.

Editing any of these is not an option: Prisma checksums applied migrations, so a changed file makes
`migrate deploy` fail on the live database with a drift error.

### The fix

`scripts/bootstrap-db.sql`, executed by `scripts/init-db.ts` immediately before
`prisma migrate deploy`. Idempotent, forward-only, and guarded per object so that it is a complete
no-op on the existing Supabase database. It creates four things, each only when absent:

1. **the `authenticated` role**, `NOLOGIN`, because every policy in the chain grants to it.
2. **the `auth` schema**, guarded on `to_regnamespace('auth') IS NULL` rather than written as
   `CREATE SCHEMA IF NOT EXISTS`, because on Supabase the connecting role may not own that schema
   and must not attempt to write in it at all.
3. **`auth.users`**, five columns (`id uuid` primary key, `email text`, `encrypted_password text`,
   `email_confirmed_at timestamptz`, `last_sign_in_at timestamptz`), guarded on
   `to_regclass('auth.users') IS NULL`. Those are exactly the columns
   `prisma/backfill-auth-credentials.ts` reads, so the same script runs against either database.
4. **`auth.uid()`**, returning `NULL::uuid`, guarded on `to_regprocedure('auth.uid()') IS NULL`.

Point 4 is the dangerous one and the reason the file is written with `DO` blocks rather than
`CREATE OR REPLACE`: on Supabase, `CREATE OR REPLACE FUNCTION auth.uid()` would overwrite GoTrue's
real implementation and break the hosted auth service. It is only ever created when absent.

On a virgin Postgres all four create, the twenty migrations replay verbatim, and migration twenty
then rewrites the helpers to read `current_setting('app.current_user_id', true)` and drops the
trigger. The end state is schema-identical to the Supabase database. The shim leaves behind an
empty `auth.users` and an `auth.uid()` that nothing calls, which is the price of keeping one
migration chain that runs on both databases, and that single chain is what makes the rollback real.

On the Supabase database all four guards skip, so the file cannot touch GoTrue.

### How it is proven

A new script `scripts/verify-fresh-db.ts` that, against a throwaway Postgres container, runs the
bootstrap, runs `migrate deploy`, runs the seed, then asserts
`prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` prints an
empty migration. Running it twice in a row must also succeed, which is what proves idempotency.

---

## Part 2: deployment topology

### Services

`docker-compose.yml` grows two services and keeps its existing shape.

| Service | Image | Notes |
| --- | --- | --- |
| `db` | `postgres:17-alpine` | named volume `pgdata`, `pg_isready` healthcheck, **no published port** |
| `mailpit` | `axllent/mailpit:v1.31.0` (tag pull-verified 2026-09-04, digest `sha256:c96991d9bef7...`) | SMTP 1025 on the internal network only; inbox UI published on `127.0.0.1:8025` |
| `init` | built, target `migrator` | gains `depends_on: db: {condition: service_healthy}` |
| `app` | built, target `runner` | unchanged; still `depends_on: init: {condition: service_completed_successfully}` |
| `caddy` | `caddy:2-alpine` | unchanged, still behind `--profile edge` |

`init` keeps `restart: "no"`, which is load-bearing: any other policy re-runs a completed job.

### Zero-configuration defaults

Every variable gets a compose-level default so `docker compose up -d` works with no `.env` present:

| Variable | Default |
| --- | --- |
| `POSTGRES_USER` | `cecodes` |
| `POSTGRES_PASSWORD` | `cecodes-local-dev` (the port is never published) |
| `POSTGRES_DB` | `cecodes` |
| `DATABASE_URL` | `postgresql://cecodes:cecodes-local-dev@db:5432/cecodes` |
| `DIRECT_URL` | same as `DATABASE_URL` |
| `SITE_URL` | `http://localhost:3000` |
| `MAIL_TRANSPORT` | `smtp` |
| `SMTP_HOST` | `mailpit` |
| `SMTP_PORT` | `1025` |
| `MAIL_FROM` | `CECODES <no-reply@localhost>` |
| `ADMIN_EMAIL` | `admin@cecodes.local` |

`ADMIN_PASSWORD` deliberately has **no default**. When it is unset, `init-db.ts` generates a
24-character password with `generateTempPassword()`, creates the admin with it, and prints it once
inside a banner in the init log. On any later run the admin already exists and nothing is printed.

A fixed default admin password on a public VPS is a backdoor. A generated one, printed once to a
log the operator already has to read to know initialization succeeded, is not. This is the single
exception to the project rule against printing credentials, it is documented as such at the call
site, and it never fires when `ADMIN_PASSWORD` is set.

### Production overrides

A production `.env` sets `DATABASE_URL` (to Supabase-hosted Postgres, or anywhere else),
`SITE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `MAIL_TRANSPORT=resend`, `RESEND_API_KEY` and
`MAIL_FROM`. Mailpit stays running and idle, or is skipped with `--scale mailpit=0`.

### The Dockerfile

Both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` build arguments are removed
from the builder stage and from `docker-compose.yml`. Nothing environment-specific is inlined at
build time any more, so **one image serves any deployment**. The runner stage gains one line
copying `src/lib/mail/templates` (see Part 3).

---

## Part 3: the mail subsystem

### Layout

```
src/lib/mail/
  transport.ts            picks the transport, exposes sendMail()
  transports/smtp.ts      nodemailer; Mailpit by default
  transports/resend.ts    the existing REST POST, moved unchanged
  render.ts               Handlebars compile, partial registration, per-process cache
  messages.ts             one typed builder per message
  templates/
    layout.hbs            table-based shell, inline styles, brand colour
    reset-password.hbs
    welcome.hbs
    password-changed.hbs
```

`transport.ts` reads `MAIL_TRANSPORT` with values `smtp`, `resend` or `none`, defaulting to `none`
when unset. `none` makes `mailConfigured()` false, which the reset action already checks before
writing a token row.

### Contracts

```ts
// transport.ts
export type MailMessage = { to: string; subject: string; html: string; text: string };
export type MailResult = { ok: true } | { ok: false; reason: "not-configured" | "failed" };
export async function sendMail(message: MailMessage): Promise<MailResult>;

// render.ts
export type TemplateName = "reset-password" | "welcome" | "password-changed";
export function renderTemplate(name: TemplateName, data: Record<string, unknown>): string;

// messages.ts
export function resetPasswordMessage(i: {
  to: string; resetUrl: string; expiresInMinutes: number;
}): MailMessage;
export function welcomeMessage(i: {
  to: string; name: string | null; setPasswordUrl: string; expiresInMinutes: number;
}): MailMessage;
export function passwordChangedMessage(i: {
  to: string; changedAt: Date; byAdmin: boolean;
}): MailMessage;
```

Every existing invariant of `send.ts` is preserved and moves into `transport.ts`: nothing throws,
nothing about a message is ever logged, the API key is validated against the visible-ASCII range
before it can reach a header, and there is a 10 second timeout. The reset action must behave
identically for a real and an invented address, so an escaping exception would be an enumeration
oracle.

### Why the templates are read at runtime

`.hbs` files are read from disk and compiled on first use, then cached per process. That keeps them
genuinely editable inside a running image, which is the point of asking for `.hbs` at all.

Two things make that survive `output: "standalone"`, which traces imports and would otherwise ship
none of them:

1. `outputFileTracingIncludes: { "/**": ["./src/lib/mail/templates/**"] }` in `next.config.ts`.
2. An explicit `COPY --from=builder /app/src/lib/mail/templates ./src/lib/mail/templates` in the
   runner stage.

Both, deliberately. A missing template would only be discovered by a user who needed a password, so
the belt-and-braces cost is worth paying. `handlebars` is added to `serverExternalPackages` so it is
not bundled, and a unit test asserts every `TemplateName` resolves to a readable file.

### Messages

| Message | Trigger | Contains |
| --- | --- | --- |
| `reset-password` | user requests a reset | one-time link, expiry, "ignore this if it was not you" |
| `welcome` | admin creates a user | a **set-your-password link**, never the temporary password |
| `password-changed` | any successful password change or reset | what changed, when, and what to do if it was not them |

The admin UI keeps showing the temporary password and offering the credentials file download,
unchanged. The welcome mail carries a link instead, because mailing a working password puts a live
credential in an unencrypted channel where it lives in an inbox forever.

Copy stays inline Spanish, for the reason already recorded in `password-reset-email.ts`: these
messages are also built from paths that have no request, and so no locale.

---

## Part 4: removing Supabase

### Deleted

- `src/lib/supabase/admin.ts`, `server.ts`, `middleware.ts`, `__tests__/middleware.test.ts`
- `src/app/auth/callback/route.ts`, `src/app/auth/confirm/route.ts` (GoTrue PKCE landings)
- `src/lib/mail/send.ts` and `src/lib/mail/password-reset-email.ts` (moved, not lost)
- packages `@supabase/ssr` and `@supabase/supabase-js`

### Changed

| File | Change |
| --- | --- |
| `src/lib/env.ts` | drop `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_PROVIDER` and `authProvider()`. Add `MAIL_TRANSPORT`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`. `mailConfigured()` becomes transport-aware. `INIT_ENV_KEYS` loses the Supabase names. |
| `src/lib/auth/server.ts` | `getUser()` loses its branch and reads the session cookie only |
| `src/lib/auth/route-gate.ts` | loses `gateSupabase()`; one gate remains |
| `src/proxy.ts` | imports the gate from `@/lib/auth/route-gate`; the comment about refreshing a Supabase session is corrected |
| `src/features/auth/actions/auth-actions.ts` | Supabase branches removed from all six actions |
| `src/features/admin/actions/user-actions.ts` | Supabase branches removed from all five actions |
| `src/features/auth/lib/errors.ts` | GoTrue error predicates replaced by Prisma unique-violation checks |
| `src/features/auth/components/reset-password-screen.tsx` | drops its Supabase reference |
| `prisma/seed.ts`, `prisma/seed-demo.ts` | admin and demo users created with one Prisma write |
| `e2e/fixture.ts`, `e2e/global-setup.ts` | `supabaseAdmin()` deleted; users created and deleted through Prisma |
| `Dockerfile`, `docker-compose.yml`, `.env.example` | build args and variables removed |
| `AGENTS.md`, `IMPLEMENTATION.md` section 8, `docs/DOCKER_DEPLOYMENT.md` | locked-stack line, security model, and the "a Supabase project is required" statement |

`prisma/backfill-auth-credentials.ts` and `src/lib/auth/credential-backfill.ts` are **kept**. They
read `auth.users`, which still exists on both databases, and they are the documented path for
anyone repeating this migration. They are no longer wired into any runtime path.

### Data safety

Nothing is deleted from any database. `auth.users` keeps all eleven `encrypted_password` values and
is untouched by every migration in this work. No migration in this work drops a column, a table or
a row.

Rollback is `git revert` of the removal commit plus a redeploy. The Supabase project stays live and
still holds every credential, so the revert restores a working system rather than an empty one.

The proof that this is safe rests on three facts, all mechanically checked rather than asserted:

1. A read-only audit (`scripts/audit-password-hashes.ts`) asserting every `passwordHash` in
   `app_users` is a well-formed 60-character bcrypt string with a supported prefix.
2. Canonical OpenBSD bcrypt test vectors in `src/lib/auth/__tests__/password.test.ts`, proving
   bcryptjs implements `$2a$` correctly.
3. The already-passing round trip in which bcryptjs verified a real GoTrue-produced hash using its
   known password.

bcrypt verification is deterministic and depends only on the hash string, so 1 and 2 together cover
every user rather than a sample.

---

## Part 5: proving 100% auth coverage

Three mechanisms, because a coverage percentage alone does not say which cases were considered, and
a written list alone does not say which are tested.

### 1. The register

`docs/auth/USE-CASES.md`, one row per case with a stable id. Fifty-four cases.

**Sign in**

- AUTH-01 correct credentials on an active user create a session, set the cookie, and land on `POST_LOGIN_PATH`
- AUTH-02 a wrong password returns an opaque key and creates no session
- AUTH-03 an unknown email returns the identical opaque key
- AUTH-04 an unknown email still costs one bcrypt comparison against a dummy hash at the policy cost
- AUTH-05 a correct password on a deactivated user is refused and is **not** counted by the throttle
- AUTH-06 a user row with a NULL `passwordHash` is refused without crashing
- AUTH-07 a malformed or truncated stored hash returns false rather than throwing
- AUTH-08 a hash below the policy cost is rehashed on successful sign-in
- AUTH-09 the session token rotates on every sign-in
- AUTH-10 email is normalized identically on lookup and on storage
- AUTH-11 sign-in input is rejected by a strict Zod schema (unknown key, oversized email)
- AUTH-12 no maximum length is applied on sign-in, so a pre-existing long password still works

**Throttle**

- AUTH-13 consecutive failures lock the per-email key
- AUTH-14 the per-IP key locks independently of the per-email key
- AUTH-15 a successful sign-in clears the per-email key
- AUTH-16 the throttle is checked before the password is verified
- AUTH-17 password reset uses its own key and cannot lock sign-in

**Sessions**

- AUTH-18 only the SHA-256 of a token is stored; the raw token never reaches the database
- AUTH-19 the cookie is httpOnly, sameSite=lax, path=/, and secure in production
- AUTH-20 an expired session reads as signed out
- AUTH-21 expired rows are deleted opportunistically
- AUTH-22 a forged or unknown cookie value resolves to null without crashing
- AUTH-23 an absent cookie resolves to null
- AUTH-24 `lastUsedAt` is refreshed on use
- AUTH-25 sign out deletes the row and clears the cookie
- AUTH-26 sign out with no session does not throw

**Authorization and immediacy**

- AUTH-27 deactivating a user takes effect on their next request
- AUTH-28 deactivating a user deletes their sessions
- AUTH-29 deleting a user cascades sessions and reset tokens
- AUTH-30 `requireAdmin()` returns 404 for a company user
- AUTH-31 a company user calling an admin Server Action is refused by `company-scope.ts`

**Password reset**

- AUTH-32 a request for a real address writes exactly one token row and sends exactly one message
- AUTH-33 a request for an unknown address returns void, writes no row, and sends nothing
- AUTH-34 a request with mail unconfigured is refused up front and writes no row
- AUTH-35 the link origin comes from `SITE_URL`
- AUTH-36 consuming a valid token sets the new hash, marks the token consumed, revokes all sessions, and invalidates that user's other outstanding tokens, in one transaction
- AUTH-37 a consumed token cannot be reused
- AUTH-38 an expired token is refused
- AUTH-39 an unknown token is refused
- AUTH-40 every reset failure returns the identical opaque result

**Password change while signed in**

- AUTH-41 the current password is required
- AUTH-42 a successful change revokes other sessions and outstanding reset tokens
- AUTH-43 `PASSWORD_MAX` is enforced on the new password
- AUTH-44 a `password-changed` message is sent

**Admin user management**

- AUTH-45 `createUser` writes credential and profile in one transaction
- AUTH-46 a failure mid-`createUser` leaves no orphan row
- AUTH-47 `createUser` on a duplicate email returns an opaque key derived from the unique violation
- AUTH-48 `createUser` sends the welcome message containing a set-password link and no password
- AUTH-49 `resetUserPassword` replaces the hash, revokes that user's sessions, and sends the `password-changed` message with `byAdmin: true`
- AUTH-50 `deleteUser` removes the row and its dependents, and checks the affected count
- AUTH-51 every admin action re-validates with a `.strict()` Zod schema

**Route gate**

- AUTH-52 an unauthenticated request to a protected route redirects to `/login` with `next` preserved
- AUTH-53 an authenticated request to `/login` redirects to `POST_LOGIN_PATH`
- AUTH-54 `/api/health/*` bypasses the gate, and cookies set during a redirect are preserved

### 2. The gate

`src/lib/auth/__tests__/use-case-coverage.test.ts` parses `docs/auth/USE-CASES.md` for ids, scans
every `*.test.ts` under `src/` and every `*.spec.ts` under `e2e/` for id references, and fails with
the list of uncovered ids. Adding a row to the register without a test breaks the build, which is
what makes the claim checkable.

Each test references its ids in its own name, for example
`it("AUTH-05 refuses a correct password on a deactivated user without counting it", ...)`.

### 3. Thresholds

`vitest.config.ts` gains a coverage block with 100% line, branch, function and statement thresholds
scoped to `src/lib/auth/**`, `src/features/auth/**`, `src/lib/mail/**` and
`src/features/admin/actions/user-actions.ts`, and no global threshold. Provider `v8`.

### End-to-end proof of the mail path

`e2e/password-reset.spec.ts` drives the whole loop against Mailpit: request a reset in the browser,
poll Mailpit's HTTP API for the message, extract the link, follow it, set a new password, sign in
with it, and confirm the old password no longer works. This is the only test that proves rendering,
transport, delivery and consumption together.

---

## Error handling

Unchanged in kind, and it is the part most likely to regress while branches are deleted:

- Server Action failures return opaque i18n keys, never sentences, and never reveal whether a
  resource exists.
- The reset request returns `void` for every input and is throttled on its own key.
- `sendMail` never throws; every failure path returns a `MailResult` the caller ignores.
- Boot-time env validation fails loudly, naming variables and never values, and exits 1.
- `init` failing means the app container never starts.

## Verification

Static gate, which is not evidence a feature works:

```
bun run typecheck && bun run lint && bun run test && bun run build
bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Then, in order:

- **V1** `scripts/verify-fresh-db.ts` against a throwaway Postgres container, run twice.
- **V2** `docker compose down -v && docker compose up -d` with no `.env` file present, reaching a
  healthy app and a login page.
- **V3** sign in as the generated admin using the password from the init log.
- **V4** full Playwright suite against the composed stack, including the new Mailpit spec.
- **V5** `bun run test` with the coverage thresholds enforced and the use-case gate passing.
- **V6** `grep -rn "supabase" src/ prisma/ e2e/ Dockerfile docker-compose.yml` returning only
  comments that describe history, and no `@supabase/*` package installed.
- **V7** the bootstrap SQL run against a database that already has all four objects, proving every
  guard skips.
- **V8** drive login, data entry and a report download in a real browser.

## Phases

Each phase ends with an independently testable deliverable and its own commit with an explicit file
list. Never `git add -A`, because the user co-commits to `main` mid-session.

| Phase | Deliverable | Proof |
| --- | --- | --- |
| P1 | bootstrap SQL, `db` service, init wiring, generated admin password | V1, V7 |
| P2 | mail subsystem, templates, transports, unit tests | `bun run test` |
| P3 | Supabase excision across code, env, Docker and docs | V6, typecheck, build |
| P4 | use-case register, coverage gate, thresholds, gap-filling tests | V5 |
| P5 | Mailpit E2E and full container verification | V2, V3, V4, V8 |
| P6 | `docs/DATA-MIGRATION.md` runbook, tested against a scratch container, not run on production | runbook rehearsal |

## Risks

| Risk | Mitigation |
| --- | --- |
| The bootstrap shim writes to Supabase's `auth` schema | Every object is guarded on non-existence, and `auth.uid()` is created rather than replaced. V7 proves the skip path. |
| `.hbs` templates missing from the standalone build | `outputFileTracingIncludes` plus an explicit `COPY`, plus a unit test that every template resolves, plus V4 which sends a real message. |
| Deleting the Supabase branch removes the rollback | The revert restores it, and the Supabase project keeps every hash. Nothing is dropped. |
| A generated admin password in a log | Only when `ADMIN_PASSWORD` is unset, printed once, never on a later run, and documented at the call site. |
| 100% thresholds make future auth work painful | Scoped to auth and mail only, with no global threshold, so unrelated work is unaffected. |
| Coverage gate passes on a test that merely names an id | Ids are referenced in test names next to the assertion they describe, and the register row states the behaviour, so a review can check the pairing. Accepted limitation: the gate proves a case was considered and exercised, not that the assertion is strong. |
| Mailpit reachable from outside the host | SMTP is on the internal network only, and the inbox UI is bound to `127.0.0.1`, matching how the app itself is bound. |
