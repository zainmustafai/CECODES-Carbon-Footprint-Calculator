# Running CECODES in Docker

A second way to run the same application. Vercel remains the primary deployment and nothing here
changes it; this exists so the app can run on any server that has Docker.

---

## 1. What you need first

Nothing external, no third-party account or project to provision first. Everything this app
needs, including its own database, comes up with the stack; the one thing you must still choose
yourself is `ADMIN_PASSWORD` (see §4), because a shipped default password would not be a
convenience.

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

Mail works the same way in intent: the stack ships a `mailpit` container as the default SMTP
target, reachable from the other containers at `mailpit:1025` and readable by you at
**http://127.0.0.1:8025**. As of this writing the application only sends mail through the Resend
API (`RESEND_API_KEY` + `MAIL_FROM`); until the SMTP transport is wired up, password-reset mail is
simply not sent when neither is set, and Mailpit's inbox stays empty. `MAIL_TRANSPORT`,
`SMTP_HOST` and `SMTP_PORT` are already set in every container's environment with Mailpit as their
target, ready for that transport to read them once it lands.

**Portable here means: one image runs on any server, against any Postgres.** Nothing
environment-specific is compiled into it at build time, so the same image can move between
servers with no rebuild.

---

## 2. Deploying

```bash
git clone <repo> && cd CECODES
cp .env.example .env          # then set at least ADMIN_PASSWORD
docker compose up -d --build
```

That is the whole procedure. To check it worked:

```bash
docker compose logs -f init   # the initialization story, in order
docker compose ps             # app should read "healthy" after ~40s
```

Add HTTPS once DNS points at the server (set `DOMAIN` in `.env` first):

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
        |  1. validate configuration      missing var -> exit 1, names the variable
        |  2. wait for the database       retries with backoff, up to 30 attempts
        |  3. prisma migrate deploy       applies ONLY migrations not yet recorded
        |  4. prisma/seed.ts              reference data + the admin account
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

If step 1, 2, 3 or 4 fails, **the app never starts**. That is deliberate: a partly-initialized
system that answers requests is worse than one that is plainly down.

---

## 4. Environment variables

Every variable below has a working default in `docker-compose.yml` except one: `ADMIN_PASSWORD`
has no default anywhere, deliberately, because a shipped default password is a vulnerability, not
a convenience. See `.env.example` for the full list with explanations; this is the short version.

### Required (initialization refuses to run without this)

| Variable | Used by | Notes |
| --- | --- | --- |
| `ADMIN_PASSWORD` | init | Minimum 12 characters. No default. |

### Defaulted but worth setting anyway

| Variable | Default | Notes |
| --- | --- | --- |
| `ADMIN_EMAIL` | `admin@cecodes.local` | The first and only way in: self-serve registration is off. The default works, but you probably want your own address. |

### Defaulted, override only if you need to

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | points at the `db` container | Point it at any Postgres instead and the `db` service is not required. |
| `DIRECT_URL` | same as `DATABASE_URL` | Used for migrations. If you front `DATABASE_URL` with a pooler, point this at the same database without the pooler. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `cecodes` / `cecodes-local-dev` / `cecodes` | Only relevant when the `db` container is the one running; change the password before exposing this anywhere but a loopback interface. |
| `MAIL_TRANSPORT`, `SMTP_HOST`, `SMTP_PORT` | `smtp`, `mailpit`, `1025` | Set in every container's environment already, pointed at Mailpit; not yet read by the application (see §1). |
| `RESEND_API_KEY` / `MAIL_FROM` | unset | The only mail transport the application actually uses today. Both or neither. |
| `DOMAIN` | `localhost` | Only for the `edge` (Caddy/TLS) profile. |
| `PORT` | `3000` | Inside the container. |

### Development only, never set on a server

| Variable | Why |
| --- | --- |
| `DEMO_SEED_ALLOWED` | Writes demo companies. `scripts/init-db.ts` **refuses to run** if this is `true`. |
| `DEMO_PASSWORD` | Only used by the demo seed. |
| `SEED_SKIP_ADMIN` | Turns the "no admin" failure back into a silent skip. |

---

## 5. After the first deploy

Initialization gets you a working system with an admin account, but **two things are deliberately
left to a human**:

**Create the first company.** Log in as `ADMIN_EMAIL` and create it in the admin UI. Automated
bootstrap creates reference data only; it never invents tenant data.

**Import the real factor library.** A fresh database has 12 starter emission factors, enough to
render the app and not enough to use it. The full library lives in the workbook under
`docs/reference/` and is shipped in the init image:

```bash
docker compose run --rm init bun prisma/import-factors.ts --dry-run   # look first
docker compose run --rm init bun prisma/import-factors.ts
```

This is a separate command on purpose: it rewrites the shared factor library, and that should be a
decision, not a side effect of restarting a container.

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

**The bundled database is never exposed.** The `db` service publishes no port. Every consumer
reaches it over the internal network, by service name. The app port is bound to `127.0.0.1`, so on
a public server it is not reachable from the internet either, until you put a proxy in front of
it.

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `env file .env not found` | You skipped `cp .env.example .env` | Create it. |
| init exits 1, "Invalid environment" | A required variable is missing or still a placeholder | The message names the variable. |
| init exits 1, "Database unreachable after 30 attempts" | Wrong host/password, or your Postgres is unreachable from the container network | Check `DIRECT_URL`. If you pointed it at an external database, confirm the `app` container can actually reach that host. |
| init exits 1, "Cannot seed the admin account" | `ADMIN_PASSWORD` missing, or too short | Set it, at least 12 characters. Without an admin there is no way in: self-serve registration is off. |
| init exits 1, "DEMO_SEED_ALLOWED=true is set" | Demo flag copied from a dev `.env` | Remove it. This guard is protecting real data. |
| app container never starts | init failed | `docker compose logs init`. The app is gated on init succeeding. |
| app exits 1 immediately | Boot-time env validation failed | `docker compose logs app`. It names the variable; today that can only be `DATABASE_URL`. |
| app runs but shows `unhealthy` | Database unreachable from the app | `curl` the readiness endpoint inside: `docker compose exec app node -e "fetch('http://127.0.0.1:3000/api/health/ready').then(r=>r.text()).then(console.log)"` |
| Styles missing, pages unstyled | `.next/static` not copied | Rebuild without cache: `docker compose build --no-cache app`. |
| Build fails downloading fonts | No outbound HTTPS on the build host | Allow egress to `fonts.googleapis.com` / `fonts.gstatic.com`. |
| Mailpit's inbox stays empty after a reset request | Mail is only sent through Resend today | Set `RESEND_API_KEY` and `MAIL_FROM`, or check back once the SMTP transport is wired up. |

Two commands worth knowing:

```bash
docker compose logs -f init          # what initialization did, in order
docker compose run --rm init bunx prisma migrate status   # what the database thinks
```

---

## 8. For a junior developer: what this actually is

**A migration** is one file of SQL describing a change to the database's shape - a new table, a new
column. This repo has 17, in `prisma/migrations/`, each in a timestamped folder. Postgres keeps a
table called `_prisma_migrations` listing which have already been applied.

`prisma migrate deploy` compares that list to the folder and runs **only what is missing**. On an
empty database it runs all 17 in order; on a database that already has 16, it runs the 17th. It
never re-runs one, never rewrites one, and never drops anything to "start clean". That is why it is
safe to run on every deploy, which is exactly what the init container does.

(There is also `prisma migrate dev`. Do not use it here - it needs a scratch "shadow" database that
Supabase's connection pooler does not provide. That is why the migrations in this repo are written
by hand; see IMPLEMENTATION.md §7.)

**Idempotent** means running it twice does the same thing as running it once. `prisma/seed.ts` is
idempotent in three different ways, and each is worth recognising:

- `createMany({ skipDuplicates: true })` for grid electricity factors - insert, ignore collisions.
- a `findFirst` check before creating each factor version - look, then leap.
- `upsert` for the admin - create it, or update the one that exists.

None of them delete. That is what makes it safe for the init container to re-run the seed on every
single restart, forever.

**What happens when the database is empty:** all 17 migrations run, the seed adds reference data
and the admin, the app starts.

**What happens when it already has data:** `migrate deploy` sees 17 of 17 recorded and applies
nothing. The seed re-runs and changes nothing, because of the three mechanisms above. Existing data
is untouched. This is the normal case, every restart.

**What happens when a migration fails:** `migrate deploy` stops at the failing migration and exits
non-zero. init exits non-zero. The app never starts, because Compose gates it on
`service_completed_successfully`. You get a clear log and a system that is plainly down rather than
subtly broken.

**What happens if two containers start at once:** they cannot both migrate, because only one
container migrates at all - `init` - and it runs once. (Prisma also takes a Postgres advisory lock,
so even if you bypassed that, the second would wait rather than corrupt anything.)

**Why the init container, and not the app:** if every app container ran migrations on boot, three
replicas would race, the logs would interleave into nonsense, and every app container would need
database-owner privileges and the Prisma CLI shipped inside it. One job, run once, keeps all three
problems away, and keeps the migration tooling out of the image that faces the internet.

**When Docker or the server restarts:** `restart: unless-stopped` brings the app back. init re-runs,
finds nothing pending, seeds nothing new, exits 0, and the app starts. No human involved.

**Why there are two health endpoints:** `/api/health/live` says "this process is running" and
checks nothing else - if it checked the database, a brief database blip would restart a perfectly
healthy container and turn a small outage into a crash loop. `/api/health/ready` runs `SELECT 1` and
returns 503 when the database is unreachable, which tells a load balancer to stop sending traffic
without killing anything. Alive and ready are genuinely different questions.
