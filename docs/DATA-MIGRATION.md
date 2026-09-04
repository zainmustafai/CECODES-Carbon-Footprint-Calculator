# Moving off Supabase-hosted Postgres

This is the runbook for moving the application's data off Supabase-hosted Postgres onto any other
Postgres, including the container database this project now ships (`docker-compose.yml`'s `db`
service, backed by the named `pgdata` volume). Nobody has asked for this to be run. It is the
procedure this project executes the day someone chooses to leave Supabase hosting, and it must be
rehearsed end to end against throwaway containers before it is ever pointed at the shared database
`.env.local` names, which holds real client data.

Every command below names the database it touches as `$SOURCE` or `$TARGET`, never inline, so a
command pasted into a terminal cannot silently land on the wrong database because a connection
string scrolled out of view. Section 0 is what makes that promise true rather than decorative:
`$TARGET` names a host that only exists inside the compose network, and every command that uses it
runs inside a container on that network.

Run every command from the repository root, the directory holding `docker-compose.yml`. The only
tool the host needs is `docker compose`. Postgres client binaries and the Prisma CLI both run
inside containers, so nothing here depends on what happens to be installed on the operator's
machine.

## 0. How these commands reach a database

The container database publishes no port. `docker-compose.yml`'s `db` service has no `ports:` key
at all, and the comment above it says why: publishing 5432 on a VPS is how a database ends up in a
botnet's scan results the same afternoon. Only `mailpit`, `app` and `caddy` publish anything.

So a host-side `psql postgresql://cecodes:cecodes-local-dev@127.0.0.1:5432/cecodes` does not reach
this stack. Worse than failing, it may succeed: port 5432 on a developer or operations machine very
often is a local Postgres, and `.env.example` teaches almost exactly that string
(`...@localhost:5432/cecodes`). A runbook written that way can bootstrap and migrate the wrong
cluster, restore a client's data into it, and then offer a truncate confirmation naming the
database `cecodes`, which is the name the operator expected to see.

Two prefixes therefore carry every command in this file, and neither can reach the host's own
Postgres:

| Prefix | Used for | Why |
| --- | --- | --- |
| `docker compose exec -T db ...` | `pg_dump`, `pg_restore`, `psql` | Runs inside the running `db` container, which is the only place those binaries exist here. |
| `docker compose run --rm -e ... init ...` | `db:bootstrap`, `prisma migrate deploy` | Runs inside the `migrator` image, which carries the repo, `node_modules` and the Prisma CLI, on the same network. |

```bash
export SOURCE="<the DIRECT_URL from .env.local>"
export TARGET="postgresql://cecodes:cecodes-local-dev@db:5432/cecodes"
```

`$SOURCE` is a real remote address and needs no help reaching what it names. `$TARGET` is the one
that has to be constrained, and it is: `db` there is a compose service name, resolved through
Docker's embedded DNS from inside the `internal` network and nowhere else, so the same string
pasted into a host shell by mistake fails to resolve rather than connecting to something. If `.env`
overrides `POSTGRES_USER`, `POSTGRES_PASSWORD` or `POSTGRES_DB`, build `$TARGET` from those values
instead; the identity check in Section 2 will catch it if you get one wrong.

`internal` is only the network's name. It is declared `driver: bridge` with no `internal: true`, so
containers on it do have outbound access, which is what lets `pg_dump` reach Supabase from inside
`db`.

**`-T` is load-bearing, not noise.** Without it `docker compose exec` allocates a TTY, and a TTY
rewrites bytes on the way through. The dump in Section 3 is a binary archive; taken through a TTY
it is silently corrupted, and the failure surfaces much later as a `pg_restore` error about a
corrupt archive. `-T` also keeps `psql` from consuming keystrokes the shell is about to read, which
matters in Section 6's confirmation prompt.

### Preflight: client version against source version

```bash
docker compose up -d db
docker compose exec -T db pg_dump --version
docker compose exec -T db psql "$SOURCE" -At -c "SHOW server_version"
```

The `db` image is `postgres:17-alpine`, so its client tools are version 17. They can dump any
server at or below 17 and restore into the container. If the source reports a *higher* major
version, stop: `pg_dump` refuses to dump a newer server. Run the client from a matching image on
the same network instead, substituting that for `docker compose exec -T db` throughout:

```bash
docker network ls | grep internal          # confirm the name, normally cecodes_internal
docker run --rm -i --network cecodes_internal postgres:18-alpine pg_dump ...
```

## 1. What moves

The entire `public` schema's data: every table Prisma manages, `companies`, `app_users`,
`facilities`, `activity_entries`, `emission_factors`, `user_sessions`, `password_reset_tokens`,
all of it.

Two things in that schema deliberately do **not** move.

`_prisma_migrations` is excluded from the dump in Section 3. It is Prisma's ledger, not application
data, and the target writes its own copy when Section 2 runs `migrate deploy`. Restoring the
source's twenty rows on top of the target's twenty would leave forty, every migration named twice,
because that table's only unique constraint is on `id` and Prisma generates a fresh `id` per
database. Nothing rejects the duplicates, so the damage is discovered later: Section 5's row counts
disagree for no obvious reason, and if any recorded checksum differs from the file on disk, the
next `migrate deploy` (which Section 6 triggers through the `init` container, mid-cutover) fails
with a checksum error instead of starting the app.

The `auth` schema does not move either. On Supabase that schema belongs to GoTrue, owned by
`supabase_admin`; the role this project connects as can read it but does not own its objects, and
dumping structure you do not own is how a restore fails on a target that has never heard of
`supabase_admin`. It stays on Supabase, untouched, for the whole of this procedure.

There is also nothing left in `auth` worth carrying across. Real sign-in credentials already live
in `public.app_users` (`passwordHash`, `passwordAlgo`), copied there once, idempotently, by
`prisma/backfill-auth-credentials.ts`. The app has not read `auth.users` for identity since
migration `20260905120100_rls_session_identity` dropped the `on_auth_user_created` trigger that
used to depend on it.

The `auth` schema that exists on the **target** after Section 2 is not a copy of anything on
Supabase. It is the four-object stub `scripts/bootstrap-db.sql` creates: the `authenticated` role,
an `auth` schema, a five-column `auth.users` table with no rows, and a stub `auth.uid()` that
always returns `NULL`. It exists only because migration `20260709120320_rls_and_auth` (migration 2
of 20) declares a `SECURITY DEFINER` function whose body calls `auth.uid()`, and Postgres validates
that call at `CREATE FUNCTION` time; replaying the migration chain on a database that has never
heard of an `auth` schema fails there, before migration 2 of 20 completes, unless the stub exists
first. Nothing queries it afterwards: identity resolution was rewritten in
`20260905120100_rls_session_identity` to read `current_setting('app.current_user_id', true)`
instead. It stays empty on every target, forever, including this one.

## 2. Prepare the target first

```bash
docker compose up -d db
docker compose run --rm \
  -e DATABASE_URL="$TARGET" -e DIRECT_URL="$TARGET" \
  init sh -c 'bun run db:bootstrap && bunx prisma migrate deploy'
```

Both halves of the pair are exported, not just `DIRECT_URL`. `prisma.config.ts` resolves
`DATABASE_URL` and `DIRECT_URL` as one decision (`resolveDatasourceUrl` in
`src/lib/env-precedence.ts`) and throws rather than guess when the two name different hosts. Naming
both, identically, is the form that says what it means. `-e` on `docker compose run` beats both the
service's `environment:` block and its `env_file:` entries, which is what stops `.env`'s Supabase
connection string from being what this actually migrates.

`sh -c '...'` rather than the image's default command, and that is the point of this step. The
`init` image's `CMD` is `bun scripts/init-db.ts`, which runs bootstrap, then `migrate deploy`, then
**`prisma/seed.ts`**. The seed must not run here. It inserts the starter emission-factor subset, six
grid factors, five factor versions, the RECs element and an admin user, all of which carry unique
keys (`emission_factors_natural_key`, `grid_electricity_factors_year_key`,
`emission_factor_versions_version_key`, `app_users_email_key`) that the restore in Section 4 then
collides with. Preparing the target with a plain `docker compose up -d` makes the same mistake.

The ledger and the RLS objects must exist before any data lands, or `pg_restore` fails on missing
roles and functions. Concretely: `bunx prisma migrate deploy` against a target with no
`_prisma_migrations` row replays every migration from `20260709120319_init` forward on that target,
including migration 2's `auth.uid()`-validated function bodies, which is exactly why
`scripts/init-db.ts` runs `scripts/bootstrap-db.sql` before every `migrate deploy`, on every boot,
against every database. `db:bootstrap` is the same statement, run on its own
(`package.json`'s script inlines `scripts/bootstrap-db.sql` through the `pg` client, reading
`DIRECT_URL` before `DATABASE_URL`, same as this file's own convention). Skip it and `migrate
deploy` does not fail quietly: it stops on the first migration that references a missing object,
and every migration after that one stays unapplied, which Section 4's `pg_restore` then meets as a
target with no tables to restore data into.

### The check that proves which database you just prepared

```bash
docker compose exec -T db psql "$TARGET" -v ON_ERROR_STOP=1 -Ax -c "
SELECT current_database()                                      AS database,
       inet_server_addr()::text                                AS server_addr,
       inet_server_port()                                      AS server_port,
       (SELECT count(*) FROM public._prisma_migrations)         AS migrations_applied,
       (SELECT count(*) FROM public.transport_subsidy_prices)   AS seeded_price_rows,
       (SELECT count(*) FROM public.app_users)
     + (SELECT count(*) FROM public.companies)
     + (SELECT count(*) FROM public.emission_factors)
     + (SELECT count(*) FROM public.reporting_years)
     + (SELECT count(*) FROM public.activity_entries)           AS application_rows"
```

Expected, and every field is a separate assertion:

- `migrations_applied` is **20**. Any other number means the chain did not finish, or this is not
  the database Section 2 prepared.
- `application_rows` is **0**. Anything else means either the seed ran (see above) or this is a
  database that already has a life of its own, which is what a stray local Postgres or a
  developer's own working database looks like from here.
- `seeded_price_rows` is **4**, or 0 if you arrived here from Section 6's truncate path. Section 4
  explains those four rows and clears them.
- `server_addr` is a container address on the compose bridge, typically `172.x.x.x`. A loopback
  address here would mean the command did not run where you think it did.

If the statement fails with `relation "public._prisma_migrations" does not exist`, stop. You are
either pointed at a database this project has never migrated, or `migrate deploy` did not run. Do
not proceed to the restore in either case.

## 3. Dump the source

```bash
docker compose exec -T db pg_dump "$SOURCE" \
  --format=custom --no-owner --no-privileges \
  --schema=public \
  --exclude-table-data='public._prisma_migrations' \
  --file=/tmp/cecodes.dump

docker compose cp db:/tmp/cecodes.dump ./cecodes.dump
head -c 5 cecodes.dump; echo        # must print exactly: PGDMP
docker compose exec -T db pg_restore --list /tmp/cecodes.dump | grep 'TABLE DATA' | wc -l
```

`pg_dump` only reads, so this is safe to rehearse against production. `--schema=public` is what
excludes the `auth` schema Section 1 describes; it is never named on the command line and never
touched. `--exclude-table-data` drops the ledger's rows but not its definition, which is all a
data-only restore looks at anyway; Section 1 says why the rows must not travel.

The dump is written inside the container and then copied out, rather than streamed through the
host, so `pg_restore` in Section 4 reads a real seekable file. The host copy is your only snapshot
of the source at the instant writes stopped, so keep it until the cutover is confirmed, and then
delete it: it is unencrypted client data. Section 8 does that.

The in-container copy lives in the container's writable layer, so `docker compose down` destroys
it while the host copy survives. If you need to restore from a dump taken before a `down`, put it
back first:

```bash
docker compose cp ./cecodes.dump db:/tmp/cecodes.dump
```

In the real cutover this does not arise: Section 6 takes a fresh dump after the target is emptied,
which is the whole reason it repeats Section 3 rather than reusing a rehearsal's archive.

`head -c 5` is the cheapest possible integrity check. Every custom-format archive starts with the
five bytes `PGDMP`. If it prints anything else, the archive is not an archive, which is what a
`docker compose exec` run without `-T` produces. The `pg_restore --list` count should be roughly
the number of tables in `public`, currently 19 once the ledger is excluded; a count of zero means
the dump captured no data.

`--format=custom` is not cosmetic. `pg_restore` cannot read a plain SQL dump at all, so it is what
makes `--data-only` and `--disable-triggers` in Section 4 available. Directory format would work
equally well; custom is chosen because it is a single file, which makes copying it out and
checksumming it trivial.

## 4. Restore

### 4a. Clear the rows a migration inserted

```bash
docker compose exec -T db psql "$TARGET" -v ON_ERROR_STOP=1 \
  -c "DELETE FROM public.transport_subsidy_prices"
```

Expect `DELETE 4`, or `DELETE 0` if you arrived from the truncate path. Any larger number means the
target is not freshly prepared. Stop and re-read Section 2.

This step exists because `--data-only` inserts into a target that Section 2 has already migrated,
and one migration inserts application rows of its own.
`prisma/migrations/20260903120100_fuel_prices_by_type/migration.sql` ends with four
`INSERT`s into `transport_subsidy_prices`, the 2024 and 2025 national average prices for
`GASOLINE` and `DIESEL`, with `gen_random_uuid()` ids, under
`CREATE UNIQUE INDEX "transport_subsidy_prices_year_fuel_key" ON ("year", "fuel")`. The source ran
that same migration, so it holds four rows with the same `(year, fuel)` keys and *different* ids.
The primary key would not collide. The unique index would.

Without this `DELETE`, the `COPY` for that table aborts on the first duplicate key.
`--disable-triggers` does not help: it suppresses trigger firing, and a unique index is not a
trigger. Before `--exit-on-error` was added below, `pg_restore` logged that failure and carried on,
so the target kept the migration's default national-average prices and dropped whatever the client
actually had. That table is admin-editable (`src/features/admin/actions/factor-actions.ts`) and it
feeds
`src/lib/calc/rollup.ts`, the preview, the dashboard and both report exports, so a price the client
had corrected would revert silently and every business-travel figure computed from a money amount
would change after cutover. Excel parity is this project's acceptance test, which makes that a
correctness failure, not a cosmetic one.

Deleting rather than excluding the table's data keeps the source as the single source of truth: the
restore then reinstates the client's own four rows, with their own ids, their `source` text and
their `updatedByEmail` stamp intact. Section 5 diffs the table value by value to prove it.

The other two migrations that contain the word `INSERT` are safe, and both were checked rather than
assumed:

- `20260709120320_rls_and_auth` has its `INSERT` inside the body of `public.handle_new_user()`. A
  function body is not executed at `CREATE FUNCTION` time, and the trigger that called it was
  dropped by `20260905120100_rls_session_identity`. No row is ever written.
- `20260903120200_transport_trips` runs `INSERT INTO transport_trips SELECT ... FROM
  activity_entries`. On the freshly migrated target `activity_entries` is empty, so it inserts zero
  rows, and the `UPDATE activity_entries` that follows it matches zero rows for the same reason.
  Confirmed, not assumed: the reviewer's belief was correct.

**When a migration is added, redo this check.** `grep -rniE '\binsert\b|\bcopy\b' prisma/migrations`
lists the candidates; a new migration that seeds rows into a table with a unique constraint needs a
line in 4a.

### 4b. Restore

```bash
docker compose exec -T db pg_restore \
  --dbname="$TARGET" \
  --no-owner --no-privileges \
  --data-only --disable-triggers \
  --exit-on-error --single-transaction \
  /tmp/cecodes.dump
```

`--exit-on-error` and `--single-transaction` are the difference between a restore that reports its
own failures and one that logs past them. By default `pg_restore` counts errors, prints a summary
at the end and exits 0, which is how a table can silently fail to load. `--exit-on-error` stops on
the first one. `--single-transaction` implies it and adds the property that matters more: on any
failure nothing at all lands, so the recovery is to fix the cause and run the same command again,
with no need to empty the target in between. Both are passed explicitly so that dropping one does
not quietly restore the old behaviour. `--single-transaction` is not compatible with `--jobs`,
which is why this restore is not parallel; at this data volume that costs seconds.

`--no-owner` and `--no-privileges` matter because the Supabase roles the dump remembers
(`supabase_admin`, `anon`, `service_role`, `authenticated`'s original grants) do not exist as
Supabase created them on the target; without these flags every `ALTER ... OWNER TO` and `GRANT`
statement in the archive fails and aborts the restore partway through a table. `--data-only`
because Section 2 already created every table, index and constraint by replaying the real
migrations; restoring structure here as well would either collide with what migration already made
or, worse, drift from it.

`--disable-triggers` lets `COPY` load each table's rows without firing foreign-key triggers per
row, so tables load in the archive's own order without failing on a parent row that has not landed
yet. It is needed for exactly that and nothing else: there are no user triggers anywhere in
`public`, the only trigger this project ever created having lived on `auth.users` and been dropped
by `20260905120100_rls_session_identity`.

**It requires SUPERUSER, not ownership.** `pg_restore` emits `ALTER TABLE ... DISABLE TRIGGER ALL`,
and disabling the internally generated constraint triggers that back a foreign key is a superuser
operation. `DISABLE TRIGGER USER` is the form a table owner may run, and it is not the form
`pg_restore` emits. This works against the shipped container only because the official `postgres`
image makes `POSTGRES_USER` the cluster's bootstrap superuser.

Against a managed Postgres it will not work. RDS's `rds_superuser`, Cloud SQL's
`cloudsqlsuperuser` and Neon's owner role are all deliberately not true superusers, and the restore
fails with `permission denied: "RI_ConstraintTrigger_c_..." is a system trigger`. On such a target,
drop `--disable-triggers` and set the replication role for the session instead, which those
providers do grant to their admin role. A managed target is reachable over the network by
definition, so this one runs from wherever the client tools live, against the host copy:

```bash
PGOPTIONS="-c session_replication_role=replica" pg_restore --dbname="$MANAGED_TARGET" \
  --no-owner --no-privileges --data-only --exit-on-error --single-transaction cecodes.dump
```

Sections 2, 4a and 5 still apply there unchanged, minus the `docker compose exec -T db` prefix.

If the provider denies that too, the remaining option is to restore schema and data together into
an empty database (no `--data-only`, so foreign keys are created after the rows they constrain) and
then stamp the ledger with `bunx prisma migrate resolve --applied <name>` once per migration, in
order. That path is longer and is not what this runbook is written for.

### 4c. Refresh the planner statistics

```bash
docker compose exec -T db psql "$TARGET" -v ON_ERROR_STOP=1 -c "ANALYZE"
```

A bulk `COPY` load leaves the target with no statistics, so the first queries the app runs after
cutover get bad plans. This is a write, and it is a write to the *target*, which is fine. Nothing
in this runbook writes to `$SOURCE`.

## 5. Verify

### 5a. Exact row counts, table by table

```bash
cat > row-counts.sql <<'SQL'
SELECT format('SELECT %L AS relname, count(*)::text AS n FROM public.%I', tablename, tablename)
  FROM pg_tables
 WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
 ORDER BY tablename
\gexec
SQL

docker compose exec -T db psql "$SOURCE" -At -f - < row-counts.sql > counts-source.txt
docker compose exec -T db psql "$TARGET" -At -f - < row-counts.sql > counts-target.txt
diff counts-source.txt counts-target.txt && echo "row counts match"
```

A count that differs by even one row means stop, do not proceed to Section 6, and find the missing
rows before touching production again.

`count(*)`, not `n_live_tup`. `n_live_tup` is a planner estimate: it is exact immediately after
`ANALYZE` for tables this small, but "immediately after" is doing real work in that sentence, and
comparing an estimate against an estimate is not a verification. `count(*)` needs no `ANALYZE` on
either side, which is what lets this section read production without writing to it, statistics
included.

The generated query is built from each side's own `pg_tables`, deliberately. If the source holds a
table in `public` that the migration chain does not create, its line appears in `counts-source.txt`
and in no other file, and the diff surfaces it. That is worth knowing: such a table's data was
dumped, and the restore had nowhere to put it.

`_prisma_migrations` is excluded because the two sides are *supposed* to disagree there. Each
database records its own ledger; Section 1 explains why the source's copy is not carried across.

### 5b. The table that nearly reverted

```bash
PRICES="SELECT year, fuel, \"pricePerGallonCop\", coalesce(source,'') FROM public.transport_subsidy_prices ORDER BY year, fuel"
docker compose exec -T db psql "$SOURCE" -At -c "$PRICES" > prices-source.txt
docker compose exec -T db psql "$TARGET" -At -c "$PRICES" > prices-target.txt
diff prices-source.txt prices-target.txt && echo "subsidy prices match"
```

A row count alone cannot see the failure Section 4a prevents. When the source holds exactly the
four default rows, which is the ordinary case, a collided restore leaves the target holding four
rows as well and 5a prints "row counts match" while the values are the migration's defaults rather
than the client's. This compares the values.

## 6. Cut over

Everything up to here was a rehearsal. This is the run whose result people use.

**Step 1. Stop every writer to the source, not just this container.**

```bash
docker compose stop app
```

`docker compose stop app` freezes the compose stack's writer. It does not freeze anything else that
still holds the Supabase connection string: a Vercel deployment, a colleague's `bun run dev`, an
open `prisma studio`, a scheduled job. Before continuing, satisfy yourself that nothing else can
write to `$SOURCE`, because the dump taken in step 3 becomes the whole of the client's data and any
write that lands after it is lost. Stopping `db` and `mailpit` is neither required nor useful here:
the point is that nothing writes to `$SOURCE`, not that the whole stack goes dark.

**Step 2. Empty the target, then repeat Sections 2 through 5 for real.**

Not "3 through 5". Emptying the target by either route below leaves it needing Section 2 again, and
Section 2's identity check is what proves the empty target you migrated is the one you are about to
restore into.

"Freshly emptied" matters because `pg_restore --data-only` inserts rows; it does not upsert.
Restoring into a target that already holds an earlier rehearsal's data collides on the same primary
keys and unique constraints (`user_sessions.tokenHash`, `password_reset_tokens.id`, and every
table's primary key), and with `--exit-on-error --single-transaction` the whole restore now aborts
and rolls back rather than half-landing.

Empty it one of two ways, and prefer the first:

**Disposable target (the recommended path).** Remove its volume and repeat Section 2 from nothing:

```bash
docker compose down
docker volume rm cecodes_pgdata
docker compose up -d db
# then Section 2, then Sections 3, 4 and 5
```

`docker compose down` here is not in tension with "stop only `app`" above. That rule is about
`$SOURCE`, which lives on Supabase and is unaffected by anything happening to these containers.
`down` is required because a volume cannot be removed while a container references it. Use
`docker volume rm` by name and not `down -v`, which would also destroy `caddy_data` and force a
Let's Encrypt re-issue that is rate limited.

This is safer than truncating for one structural reason: it never connects to `$TARGET` at all, it
only ever acts on the volume Section 2 already created, so there is no database name for a stale
shell variable to get wrong.

**Target that must survive (fallback only).** Use this when the target cannot simply be recreated,
for example a shared long-lived staging database. Truncating names `$TARGET` directly on a
production-shaped command with no undo, so run this guard first, every time, and read what it
prints before typing anything:

```bash
target_id=$(docker compose exec -T db psql "$TARGET" -At -c \
  "SELECT current_database() || '|' ||
          coalesce(host(inet_server_addr()), 'a local socket') || ':' || inet_server_port()" \
  </dev/null)
target_name=${target_id%%|*}
target_where=${target_id#*|}

if [ -z "$target_name" ]; then
  echo "ABORT: could not read the target's identity. psql failed, or the db container is not"
  echo "running, or \$TARGET is wrong. Nothing was touched."
else
  printf 'About to TRUNCATE every table in database "%s" on %s.\nType that database name to confirm, anything else aborts: ' \
    "$target_name" "$target_where"
  read -r confirm
  if [ -n "$confirm" ] && [ "$confirm" = "$target_name" ]; then
    tables=$(docker compose exec -T db psql "$TARGET" -At -c \
      "SELECT string_agg(format('public.%I', tablename), ', ')
         FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'" </dev/null)
    if [ -z "$tables" ]; then
      echo "ABORT: no tables found to truncate. Run Section 2 first."
    else
      docker compose exec -T db psql "$TARGET" -v ON_ERROR_STOP=1 \
        -c "TRUNCATE TABLE $tables RESTART IDENTITY CASCADE"
    fi
  else
    echo "Confirmation did not match. Aborting, nothing was touched."
  fi
fi
```

The guard fails closed on every path. The `-z "$target_name"` branch is the one that matters most:
an earlier version compared the operator's answer against a variable that was empty whenever `psql`
failed or was missing, so pressing Enter matched empty against empty and the truncate ran. Now an
unreadable identity aborts before the prompt is ever printed, and the answer must additionally be
non-empty to match. `coalesce(host(inet_server_addr()), 'a local socket')` covers the other half of
that bug: `inet_server_addr()` returns NULL over a Unix socket, so the old message ended in "on
host " with nothing after it.

The confirmation is not "retype `$TARGET`", which would only prove the variable agrees with itself.
It asks the operator to type the database name they believe they are about to empty, against what
`$TARGET` actually resolves to right now. A stale `$TARGET` left over from an earlier shell, or a
copy-pasted wrong export line, shows up here as a mismatch, before anything is truncated rather
than after.

The truncate itself is one statement over all tables rather than one statement per table, so it is
a single transaction: it either empties everything or nothing, and it cannot leave the target half
empty if it is interrupted.

`_prisma_migrations` is excluded from the truncate on purpose: it is Prisma's record of which
migrations Section 2 already applied, not application data, and truncating it would make `migrate
deploy` believe none of the twenty migrations has ever run, so a later `migrate deploy` replays all
of them from `20260709120319_init` against tables that already exist and fails on the first `CREATE
TABLE`, leaving the target with neither data nor a working schema path, mid-cutover.

**Step 3. Point `.env` at the target, and settle the admin variables.**

Update **both** `DATABASE_URL` and `DIRECT_URL` in `.env` to name the target, not just
`DATABASE_URL`. `docker-compose.yml` defaults `DIRECT_URL` to whatever `DATABASE_URL` resolves to
only when `.env` leaves `DIRECT_URL` unset; if `.env` already has an explicit `DIRECT_URL` line
pointing at Supabase (as `.env.example` sets both explicitly), leaving it there means the next
`init` run replays migrations against Supabase while `app` queries the target, which is two
different databases disagreeing about what schema exists.

These are read by containers rather than by a client on the compose network, so here the host is
the service name as the containers see it: `postgresql://cecodes:cecodes-local-dev@db:5432/cecodes`
is the same string `$TARGET` holds.

Then deal with `ADMIN_EMAIL` and `ADMIN_PASSWORD`, because step 4 runs the seed against data that
is now real:

- **Set `ADMIN_EMAIL` to the production admin's actual address.** It cannot be switched off.
  `docker-compose.yml` interpolates `${ADMIN_EMAIL:-admin@cecodes.local}`, and `:-` treats an empty
  value as unset, so blanking the line in `.env` still yields `admin@cecodes.local` and
  `prisma/seed.ts` creates a *second* admin account with a generated password printed into
  `docker compose logs init`. `SEED_SKIP_ADMIN=true` does not help, because the seed only consults
  it when `ADMIN_EMAIL` is empty and the compose default guarantees it is not.
- **Leave `ADMIN_PASSWORD` unset.** With it unset and the admin row already present, `seedAdmin()`
  takes its "password unchanged" branch and leaves the stored hash alone. Set to a value that
  differs from the password in force, it rewrites the hash and deletes every one of that user's
  rows in `user_sessions` and `password_reset_tokens`, which signs the real admin out and
  invalidates any reset link they were sent. That behaviour is deliberate (it is how an operator
  recovers an admin account nobody can get into), but a cutover is not the moment to trigger it by
  accident.

**Step 4. Start the stack.**

```bash
docker compose up -d
```

This starts `init`, which runs `scripts/init-db.ts` against the restored target: bootstrap (every
guard skips, the objects exist), `migrate deploy` (a no-op, the ledger is intact and holds exactly
twenty rows because Section 3 excluded the source's copy), and then `prisma/seed.ts`.

The seed writes to the data you just restored, so it is worth knowing exactly what it can and
cannot do to it. It cannot overwrite the factor library (`emissionFactor.count()` is non-zero, so
the starter subset is skipped), cannot revert a grid factor (`createMany({skipDuplicates:true})`),
cannot duplicate a factor version or the RECs element (both are existence-checked), and cannot
touch a company, entry or result. What it does write is the admin row, which is what step 3 is for.

Then sign in, open the dashboard, and download one report before telling anyone it is done.

## 7. Rollback

Put the old `DATABASE_URL` and `DIRECT_URL` back in `.env` and run `docker compose up -d`.

The rollback is clean in the sense that matters: no command in Sections 2 through 6 writes to
`$SOURCE`. `pg_dump` reads, the verification queries read, and the truncate and restore name
`$TARGET` only. Supabase's schema and its data are exactly as they were, so the old system comes
back up whole rather than partially.

Two things that "nothing was ever modified" would gloss over, and an operator deciding to roll back
at 2am deserves both:

1. **The restart itself writes to Supabase.** `docker compose up -d` runs `init` against whatever
   `.env` now names. `scripts/bootstrap-db.sql` is a genuine no-op there (all four guards skip on
   Supabase, which is the whole reason they are guards) and `migrate deploy` has nothing pending,
   but `prisma/seed.ts` upserts the `ADMIN_EMAIL` row in `public.app_users`, forcing its role to
   `CECODES_ADMIN`. It is idempotent and it is not data loss, but it is a write. Step 3's
   `ADMIN_PASSWORD` rule applies to the rollback for the same reason it applies to the cutover.
2. **Anything written after cutover stays on the target.** From the moment step 4 succeeds, users
   are entering data into the container database. Rolling back returns the app to the source as it
   was at the freeze, and every entry made since is left behind in the `pgdata` volume. It is
   recoverable (dump the target and replay it) but it is not automatic, and the window is however
   long the new system was live. Roll back quickly or not at all.

The only production-facing change this runbook makes before step 4 is stopping the `app` container
in step 1, which this step also undoes.

## 8. Clean up

```bash
docker compose exec -T db rm -f /tmp/cecodes.dump
rm -f cecodes.dump counts-source.txt counts-target.txt prices-source.txt prices-target.txt row-counts.sql
```

Both dump copies are the client's entire database in plaintext, one on the host filesystem and one
inside a container layer. Keep the host copy somewhere deliberate if you want a pre-cutover backup,
which is a good idea; do not leave it in the repository working tree, where the next
`docker compose build` sends it to the daemon and the next `git add` offers to commit it.

`$SOURCE` was also passed on a command line, so it is in the shell's history file with the Supabase
password in it. Clear that too.
