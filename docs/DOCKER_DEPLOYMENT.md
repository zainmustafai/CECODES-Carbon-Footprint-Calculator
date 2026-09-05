# Running CECODES in Docker

A second way to run the same application. Vercel remains the primary deployment and nothing here
changes it; this exists so the app can run on any server that has Docker.

---

## 1. What you need first

Nothing external, no third-party account or project to provision first. Everything this app
needs, including its own database and a mail server, comes up with the stack. There is nothing you
must choose yourself before the first `docker compose up`.

Four containers by default:

| Service | What it is | Holds |
| --- | --- | --- |
| `db` | Postgres 17, with a named volume | every table: companies, sedes, activity entries, factors, `app_users`, `user_sessions` |
| `init` | a one-shot job | applies pending migrations, seeds reference data and the admin account, then exits |
| `app` | the Next.js server | serves the application |
| `mailpit` | a mail catcher | password-reset mail, when no real mail provider is configured |

Identity lives in this database now, not a third party's: `app_users` holds the password hash and
`user_sessions` holds the session. Nothing here talks out to authenticate a user.

`DATABASE_URL` may point at the bundled `db` container, or at any other Postgres you already run
and manage yourself; nothing in this repo assumes one provider. Overriding it in `.env` is enough;
`init` still waits for the bundled `db` container to become healthy before it starts, so a
deployment that ignores it simply runs one unused Postgres alongside the one it actually talks to.

**Mail works out of the box.** `MAIL_TRANSPORT` defaults to `smtp` and points at the bundled
`mailpit` container at `mailpit:1025`, so a password reset is composed and delivered with no
provider account at all. Read what it caught at **http://127.0.0.1:8025**. A production deployment
sets `MAIL_TRANSPORT=resend` with `RESEND_API_KEY` and `MAIL_FROM` instead, at which point Mailpit
sits idle. `MAIL_TRANSPORT=none` turns mail off entirely, and the password-reset action then
refuses up front rather than telling a user to watch an inbox nothing will arrive in.

> ### Read the init log for the admin password
>
> `ADMIN_PASSWORD` is optional, and leaving it unset is the safer choice. When it is unset,
> `prisma/seed.ts` **generates a random 24-character password and prints it exactly once**, in the
> `init` container's log, on the run that creates the admin row:
>
> ```bash
> docker compose logs init
> ```
>
> ```
>   ============================================================
>    ADMIN ACCOUNT CREATED
>    email:    admin@cecodes.local
>    password: <24 random characters>
>    Sign in and change this now. It is not shown again.
>    Set ADMIN_PASSWORD in .env to choose your own instead.
>   ============================================================
> ```
>
> It is never printed again. Later restarts log `Admin ✓  (password unchanged, ADMIN_PASSWORD not
> set)` and leave the stored hash alone, and `docker compose down` deletes the `init` container
> along with its logs. If you miss it, section 7 has the way back in.

**Portable here means: one image runs on any server, against any Postgres.** Nothing
environment-specific is compiled into it at build time, so the same image can move between
servers with no rebuild.

---

## 2. Deploying

```bash
git clone <repo> && cd CECODES
cp .env.example .env          # every value already has a working default; edit only what you change
docker compose up -d --build
```

That is the whole procedure. To check it worked, and to collect the admin password if you did not
set one:

```bash
docker compose logs -f init   # the initialization story, in order, including the password banner
docker compose ps             # app should read "healthy" after ~40s
```

Add HTTPS once DNS points at the server (set `DOMAIN` in `.env` first, which also makes the links
in password-reset mail point at your real hostname):

```bash
docker compose --profile edge up -d
```

---

## 3. What happens when you run that

```
docker compose up -d
        |
        v
   init container
        |  1. validate configuration      missing or malformed var -> exit 1, names the variable
        |  2. wait for the database       retries with backoff, up to 30 attempts, on DIRECT_URL
        |  3. scripts/bootstrap-db.sql    four objects the migration chain needs (see section 8)
        |  4. prisma migrate deploy       applies ONLY migrations not yet recorded
        |  5. prisma/seed.ts              reference data + the admin account
        |  6. import-factors (first run)  the full library, only if none is loaded yet
        |
        v  exits 0
   app container starts        <- only now, because of service_completed_successfully
        |
        v
   /api/health/ready returns 200
        |
        v
      READY
```

If any of steps 1 to 5 fails, **the app never starts**. That is deliberate: a partly-initialized
system that answers requests is worse than one that is plainly down. Step 6 is the exception and
warns instead: a missing factor library leaves an app that works and reports its own gaps, which is
better than no app at all.

---

## 4. Environment variables

Every variable below has a working default in `docker-compose.yml`, so a `.env` copied straight from
`.env.example` boots with no edits. See `.env.example` for the full list with explanations; this is
the short version.

The one deployment shape with a genuinely required variable is a **non-compose** one, running the
built app directly against a database you manage yourself: there `DATABASE_URL` has no `db` service
to default to, and the app refuses to start without it.

### The admin account

This is the only way into a fresh system: self-serve registration is off.

| Variable | Default | Notes |
| --- | --- | --- |
| `ADMIN_EMAIL` | `admin@cecodes.local` | Must parse as an email address, or init exits 1 naming it. Lower-cased before the row is written. The default works, but you probably want your own address. |
| `ADMIN_PASSWORD` | none, and **optional** | Unset means one is generated and printed once (see section 1). If you do set it, minimum 12 characters, checked before anything is touched. Setting it after the admin already exists resets that password on the next init run and ends every open session. |

### Database

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | points at the `db` container | Point it at any Postgres instead and the `db` service is not required. |
| `DIRECT_URL` | same as `DATABASE_URL` | Used for migrations, and the connection init waits on. If you front `DATABASE_URL` with a pooler, point this at the same database without the pooler. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `cecodes` / `cecodes-local-dev` / `cecodes` | Only relevant when the `db` container is the one running; change the password before exposing this anywhere but a loopback interface. |
| `DB_HOST_BINDING` | `127.0.0.1:55432` | Where the `db` container is published on the host. Only host-side tooling uses it; containers reach the database as `db:5432`. Change it if 55432 is taken, and keep the `127.0.0.1:` prefix. |
| `SKIP_FACTOR_IMPORT` | unset | `true` stops `init` importing the full factor library on a first deployment. Leave it unset unless you intend to load the library yourself. |

### Public address, which is what emailed links are built from

`src/lib/site-url.ts` resolves the origin in this order: `SITE_URL`, then `DOMAIN`, then
`VERCEL_URL`. With no usable origin the password-reset action refuses and logs
`[auth] password reset requested, but no public origin is configured`, rather than mailing a live
token behind a dead link.

| Variable | Default | Notes |
| --- | --- | --- |
| `DOMAIN` | unset | Your public hostname, e.g. `huella.example.org`, a bare hostname with no scheme. Set it in `.env` and emailed links are built as `https://<DOMAIN>`. The optional `edge` (Caddy/TLS) profile uses the same value to obtain a certificate. |
| `SITE_URL` | unset | A **full absolute http(s) URL**, and it takes precedence over `DOMAIN`. Only for a deployment whose public address is not simply `https://<DOMAIN>`. Validated at boot: a bare hostname here stops the app and names the variable, instead of being silently discarded. |

With neither set, a purely local trial still resolves `http://localhost:3000`, which is why the
bundled reset flow works with no configuration at all.

### Mail

| Variable | Default | Notes |
| --- | --- | --- |
| `MAIL_TRANSPORT` | `smtp` | One of `smtp`, `resend`, `none`. Anything else stops the app at boot. |
| `MAIL_FROM` | `CECODES <no-reply@localhost>` | **Required whenever `MAIL_TRANSPORT` is `smtp` or `resend`**; the app and init both refuse to start without it. A From header, so either a bare address or `Name <address>`, and it must contain an `@`. |
| `SMTP_HOST` | `mailpit` | Required when `MAIL_TRANSPORT=smtp`. |
| `SMTP_PORT` | `1025` | Implicit TLS on port 465 only. Anything else starts plaintext and upgrades with STARTTLS when the relay offers it. |
| `SMTP_USER` / `SMTP_PASSWORD` | unset | Omitted from the connection entirely when unset, which is what Mailpit wants. A real relay usually needs both. |
| `RESEND_API_KEY` | unset | Required when `MAIL_TRANSPORT=resend`, together with `MAIL_FROM`. Both or neither. |

### Other

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | Inside the container. The published binding lives in `docker-compose.yml`. |

### Development only, never set on a server

| Variable | Why |
| --- | --- |
| `DEMO_SEED_ALLOWED` | Writes demo companies. `scripts/init-db.ts` **refuses to run** if this is `true`. |
| `DEMO_PASSWORD` | Only used by the demo seed. |
| `SEED_SKIP_ADMIN` | Turns the "no `ADMIN_EMAIL`" failure back into a silent skip. |

---

## 5. After the first deploy

Initialization gets you a working system with an admin account and the full factor library. **One
thing is deliberately left to a human**:

**Create the first company.** Log in as `ADMIN_EMAIL` and create it in the admin UI. Automated
bootstrap creates reference data only; it never invents tenant data.

**The factor library loads itself on a first deployment**, so this is no longer a step. `init`
checks the library after seeding, and when it still holds nothing but the starter subset it imports
the full workbook from `docs/reference/` (shipped in the init image) with `--apply-grid`. A fresh
system therefore comes up with the real library, not a dozen placeholder rows.

It fires **only** into an untouched library. The moment a real one exists the check stops it for
good, and the import goes back to being a command you run deliberately, because from then on it
rewrites rows an admin may have edited:

```bash
docker compose run --rm init bun prisma/import-factors.ts --dry-run   # look first
docker compose run --rm init bun prisma/import-factors.ts
```

Set `SKIP_FACTOR_IMPORT=true` to suppress the first-run import. If it fails, the app still starts:
a partial library is a visible condition (the app reports unpriced sources) rather than a reason to
refuse service, and `init` prints the command to re-run.

---

## 6. Things that will surprise you

**One image serves any deployment.** Nothing environment-specific is compiled into the JavaScript
at build time any more, so you CAN build once and promote the same image from staging to
production; nothing here forces a rebuild per target.

**Run exactly one app container.** `unstable_cache` and `revalidatePath` in
`src/features/admin/lib/factor-library-cache.ts` are per-process. With two containers, an admin
editing a factor invalidates the cache on the one that served the edit; the other keeps serving the
old value. Vercel hides this behind a shared cache layer. Compose does not.

**The build needs internet.** `src/app/layout.tsx` loads fonts via `next/font/google`, which fetches
from Google during `docker build`.

**Nothing is published beyond loopback.** Every published port is bound to `127.0.0.1`: the app on
3000, Mailpit on 1025 and 8025, and the database on **55432** (not 5432, so it cannot collide with
a Postgres the host already runs). On a public server none of them is reachable from the internet
until you put a proxy in front. Containers reach the database as `db:5432` and ignore the published
mapping entirely; it exists for host-side tooling. If 55432 is already taken on your server, set
`DB_HOST_BINDING=127.0.0.1:55433` in `.env` - a failed binding stops the whole stack, not just that
one service.

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| You never saw the generated admin password | The banner prints once, on the run that creates the admin row, and `docker compose down` removed the log along with the container | Set `ADMIN_PASSWORD` in `.env` (12+ characters) and re-run initialization: `docker compose run --rm init`. That rewrites the password and ends every open session. |
| init exits 1, "Invalid environment" | A variable is missing or malformed | The message names it. Commonly `ADMIN_EMAIL` not parsing as an address, `ADMIN_PASSWORD` under 12 characters, `SITE_URL` given as a bare hostname, or `MAIL_FROM` missing next to the selected transport. |
| init exits 1, "Database unreachable after 30 attempts" | Wrong host or password, or your Postgres is unreachable from the container network | Check `DIRECT_URL`. If you pointed it at an external database, confirm the containers can actually reach that host. |
| init exits 1, "Database bootstrap failed" | The connecting role cannot create the objects `scripts/bootstrap-db.sql` supplies | On a fresh database it needs to create a role and a schema. On a managed Postgres, connect as an owner-level role. |
| init exits 1, "Cannot seed the admin account. Missing: ADMIN_EMAIL" | `ADMIN_EMAIL` is empty | Set it. Without an admin there is no way in: self-serve registration is off. |
| init exits 1, "DEMO_SEED_ALLOWED=true is set" | Demo flag copied from a dev `.env` | Remove it. This guard is protecting real data. |
| app container never starts | init failed | `docker compose logs init`. The app is gated on init succeeding. |
| app exits 1 immediately | Boot-time env validation failed | `docker compose logs app`. It names the variable: `DATABASE_URL`, a malformed `SITE_URL`, an unknown `MAIL_TRANSPORT`, or a half-configured transport (`SMTP_HOST`/`MAIL_FROM` for smtp, `RESEND_API_KEY`/`MAIL_FROM` for resend). |
| app runs but shows `unhealthy` | Database unreachable from the app | Hit the readiness endpoint inside: `docker compose exec app node -e "fetch('http://127.0.0.1:3000/api/health/ready').then(r=>r.text()).then(console.log)"` |
| Styles missing, pages unstyled | `.next/static` not copied | Rebuild without cache: `docker compose build --no-cache app`. |
| Build fails downloading fonts | No outbound HTTPS on the build host | Allow egress to `fonts.googleapis.com` / `fonts.gstatic.com`. |
| Mailpit's inbox stays empty after a reset request | `MAIL_TRANSPORT` is not `smtp`, or no public origin is configured, or that address simply has no active account | `docker compose logs app`. `[auth] password reset requested, but no mail is configured` names the transport; `... no public origin is configured` means set `DOMAIN` or `SITE_URL`. Neither line appears when the address has no account, which is deliberate: the action answers identically either way. |
| Reset mail arrives with links pointing at `localhost` | `DOMAIN` and `SITE_URL` are both unset, so the local default is in force | Set `DOMAIN` in `.env` to your real hostname and restart the app. |

Three things worth knowing:

```bash
docker compose logs -f init                                # what initialization did, in order
docker compose run --rm init bunx prisma migrate status    # what the database thinks
# http://127.0.0.1:8025                                    # Mailpit, where reset mail lands by default
```

---

## 8. For a junior developer: what this actually is

**A migration** is one file of SQL describing a change to the database's shape, a new table or a new
column. This repo has 20, in `prisma/migrations/`, each in a timestamped folder. Postgres keeps a
table called `_prisma_migrations` listing which have already been applied.

`prisma migrate deploy` compares that list to the folder and runs **only what is missing**. On an
empty database it runs all 20 in order; on a database that already has 19, it runs the 20th. It
never re-runs one, never rewrites one, and never drops anything to "start clean". That is why it is
safe to run on every deploy, which is exactly what the init container does.

**Why `scripts/bootstrap-db.sql` runs first, and why nobody uses `prisma migrate dev` here.**
Migration 2 of the 20 grants to a role named `authenticated`, calls `auth.uid()` inside a function
body that Postgres validates at CREATE time, and attaches a trigger to `auth.users`. Those objects
came from the hosted database this project started on, and the role itself is not created until
migration 20. Prisma **checksums every applied migration**, so migration 2 cannot simply be edited:
changing it would make `migrate deploy` reject the chain on every database that already ran it. The
four missing objects are supplied ahead of the chain by `scripts/bootstrap-db.sql` instead, which is
not a migration, has no checksum, is guarded per object, and is safe to re-run forever.

That is also the real reason `prisma migrate dev` is not used here, and it has nothing to do with
which Postgres you run. `migrate dev` builds a scratch "shadow" database and replays the whole chain
into it; that scratch database never receives the bootstrap, so the replay fails at migration 2. It
also rewrites and resets, which is never what a deployment wants. Migrations in this repo are
therefore hand-authored SQL; see IMPLEMENTATION.md section 7.

**Idempotent** means running it twice does the same thing as running it once. `prisma/seed.ts` is
idempotent in three different ways, and each is worth recognising:

- `createMany({ skipDuplicates: true })` for grid electricity factors, so inserts ignore collisions.
- a `findFirst` check before creating each factor version, so it looks before it leaps.
- `upsert` for the admin, so it creates the row or updates the one that is already there.

None of them delete. That is what makes it safe for the init container to re-run the seed on every
single restart, forever.

**What happens when the database is empty:** the bootstrap creates its four objects, all 20
migrations run, the seed adds reference data and the admin, the app starts.

**What happens when it already has data:** the bootstrap finds all four objects present and does
nothing, `migrate deploy` sees 20 of 20 recorded and applies nothing, and the seed re-runs and
changes nothing, because of the three mechanisms above. Existing data is untouched. This is the
normal case for every redeploy.

**What happens when a migration fails:** `migrate deploy` stops at the failing migration and exits
non-zero. init exits non-zero. The app never starts, because Compose gates it on
`service_completed_successfully`. You get a clear log and a system that is plainly down rather than
subtly broken.

**What happens if two containers start at once:** they cannot both migrate, because only one
container migrates at all, `init`, and it runs once. (Prisma also takes a Postgres advisory lock, so
even if you bypassed that, the second would wait rather than corrupt anything.)

**Why the init container, and not the app:** if every app container ran migrations on boot, three
replicas would race, the logs would interleave into nonsense, and every app container would need
database-owner privileges and the Prisma CLI shipped inside it. One job, run once, keeps all three
problems away, and keeps the migration tooling out of the image that faces the internet.

**When Docker or the server restarts:** `restart: unless-stopped` brings `db`, `app` and `mailpit`
back on their own. **`init` does not re-run.** That is deliberate: it carries `restart: "no"`,
because any other policy would restart a job that had already completed successfully and re-run the
seed on a loop.

The consequence is worth stating plainly, because a restart is the one case the diagram in section 3
does not describe. Docker's restart policies do not honour `depends_on`, which only orders a
`docker compose up`. So after a host reboot the `app` container can come back **before** `db` is
accepting connections, with no `init` in between to wait for it. In practice this is benign: boot
validation only reads configuration and never touches the database, so the process starts; the
healthcheck allows a 40-second `start_period` before it counts a failure; and Prisma reconnects, so
`/api/health/ready` flips from 503 to 200 as soon as Postgres is up. No human is involved either
way.

What a reboot therefore does **not** do is apply migrations. Pending migrations are applied when you
run `docker compose up -d`, which is what a deploy is. To make initialization run again on its own,
run `docker compose run --rm init`.

**Why there are two health endpoints:** `/api/health/live` says "this process is running" and checks
nothing else. If it checked the database, a brief database blip would restart a perfectly healthy
container and turn a small outage into a crash loop. `/api/health/ready` runs `SELECT 1` and returns
503 when the database is unreachable, which tells a load balancer to stop sending traffic without
killing anything. Alive and ready are genuinely different questions.
