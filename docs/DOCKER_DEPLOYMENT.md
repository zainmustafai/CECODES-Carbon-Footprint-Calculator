# Running CECODES in Docker

A second way to run the same application. Vercel remains the primary deployment and nothing here
changes it; this exists so the app can run on any server that has Docker.

---

## 1. What you need first

A **Supabase project**. This is not optional, and it is the one thing worth understanding before
anything else.

Supabase gives this app two separate things:

| What | Reached over | Holds |
| --- | --- | --- |
| Postgres | `DATABASE_URL` | every business table: companies, sedes, activity entries, factors |
| Auth (GoTrue) | `NEXT_PUBLIC_SUPABASE_URL` | user accounts, passwords, sessions |

The Prisma schema in this repo describes **only the first**. There is no password column, no session
table, nowhere for a login to live. `AppUser.id` *is* the Supabase auth user's uuid.

So pointing `DATABASE_URL` at a plain Postgres container would give you every table and **nobody
able to log in**. It would not even get that far: migration `20260709120320_rls_and_auth` refers to
`auth.users`, `auth.uid()` and the `authenticated` role, none of which exist outside Supabase, so
it fails and takes the 15 migrations after it with it.

**Portable here means: this app runs on any server, against a Supabase project.** Moving servers is
easy. Moving off Supabase is a different project, and a large one.

---

## 2. Deploying

```bash
git clone <repo> && cd CECODES
cp .env.example .env          # then fill in the required values
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

`--build` is needed because `NEXT_PUBLIC_*` values are compiled into the app (see §6).

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

### Required (the app refuses to start without these)

| Variable | Used by | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | app, init | **Compiled in at build time.** Changing it needs `--build`. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | app, init | Same. |
| `SUPABASE_SERVICE_ROLE_KEY` | init | Full database rights. Never expose it, never log it. |
| `DATABASE_URL` | app | Pooled connection, port 6543. |
| `DIRECT_URL` | init | Direct connection, port 5432. Migrations cannot use a pooler. |
| `ADMIN_EMAIL` | init | The first and only way in. |
| `ADMIN_PASSWORD` | init | Minimum 12 characters. |

### Optional

| Variable | Default | Notes |
| --- | --- | --- |
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

**One image belongs to one Supabase project.** Next compiles `NEXT_PUBLIC_*` values *into* the
JavaScript at build time. You cannot build once and promote the same image from staging to
production; build on the target host. (Worth revisiting: nothing in the browser actually reads
these two variables, so they could become ordinary server-side variables and this limitation would
disappear.)

**Run exactly one app container.** `unstable_cache` and `revalidatePath` in
`src/features/admin/lib/factor-library-cache.ts` are per-process. With two containers, an admin
editing a factor invalidates the cache on the one that served the edit; the other keeps serving the
old value. Vercel hides this behind a shared cache layer. Compose does not.

**The build needs internet.** `src/app/layout.tsx` loads fonts via `next/font/google`, which fetches
from Google during `docker build`.

**The database is never exposed.** There is no database container and no published database port.
The app port is bound to `127.0.0.1`, so on a public server it is not reachable from the internet
until you put a proxy in front of it.

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `env file .env not found` | You skipped `cp .env.example .env` | Create it. |
| init exits 1, "Invalid environment" | A required variable is missing or still a placeholder | The message names the variable. |
| init exits 1, "Database unreachable after 30 attempts" | Wrong host/password, or the Supabase project is paused | Check `DIRECT_URL`; open the Supabase dashboard. |
| init exits 1, "Cannot seed the admin account" | `ADMIN_EMAIL`/`ADMIN_PASSWORD` missing | Set them. Without an admin there is no way in: self-serve registration is off. |
| init exits 1, "DEMO_SEED_ALLOWED=true is set" | Demo flag copied from a dev `.env` | Remove it. This guard is protecting real data. |
| app container never starts | init failed | `docker compose logs init`. The app is gated on init succeeding. |
| app exits 1 immediately | Boot-time env validation failed | `docker compose logs app`. It names the variable. |
| app runs but shows `unhealthy` | Database unreachable from the app | `curl` the readiness endpoint inside: `docker compose exec app node -e "fetch('http://127.0.0.1:3000/api/health/ready').then(r=>r.text()).then(console.log)"` |
| Every request returns 503 "Service misconfigured" | Supabase URL/key missing or placeholder | Fix `.env`, then rebuild (`--build`), because these are compile-time values. |
| Styles missing, pages unstyled | `.next/static` not copied | Rebuild without cache: `docker compose build --no-cache app`. |
| Build fails downloading fonts | No outbound HTTPS on the build host | Allow egress to `fonts.googleapis.com` / `fonts.gstatic.com`. |

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
