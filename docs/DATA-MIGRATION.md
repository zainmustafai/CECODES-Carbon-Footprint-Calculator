# Moving off Supabase-hosted Postgres

This is the runbook for moving the application's data off Supabase-hosted Postgres onto any other
Postgres, including the container database this project now ships (`docker-compose.yml`'s `db`
service, backed by the named `pgdata` volume). Nobody has asked for this to be run. It is the
procedure this project executes the day someone chooses to leave Supabase hosting, and it must be
rehearsed end to end against throwaway containers before it is ever pointed at the shared database
`.env.local` names, which holds real client data.

Every command below names the database it touches as `$SOURCE` or `$TARGET`, never inline, so a
command pasted into a terminal cannot silently land on the wrong database because a connection
string scrolled out of view. You will need `pg_dump`, `pg_restore` and `psql` whose major version
matches (or exceeds) the newer of the two clusters, `docker compose`, and `bunx prisma`.

## 1. What moves

The entire `public` schema, data and all: every table Prisma manages, `companies`, `app_users`,
`facilities`, `activity_entries`, `emission_factors`, `user_sessions`, `password_reset_tokens`,
all of it.

What does **not** move: the `auth` schema. On Supabase that schema belongs to GoTrue, owned by
`supabase_admin`; the role this project connects as can read it but does not own its objects, and
dumping structure you do not own is how a restore fails on a target that has never heard of
`supabase_admin`. It stays on Supabase, untouched, for the whole of this procedure. That is what
makes the rollback in Section 7 complete rather than partial.

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
export TARGET="postgresql://cecodes:cecodes-local-dev@127.0.0.1:5432/cecodes"
DIRECT_URL="$TARGET" bun run db:bootstrap
DIRECT_URL="$TARGET" bunx prisma migrate deploy
```

The ledger and the RLS objects must exist before any data lands, or `pg_restore` fails on missing
roles and functions. Concretely: `bunx prisma migrate deploy` against a target with no
`_prisma_migrations` row replays every migration from `20260709120319_init` forward on that target,
including migration 2's `auth.uid()`-validated function bodies, which is exactly why
`scripts/init-db.ts` runs `scripts/bootstrap-db.sql` before every `migrate deploy`, on every boot,
against every database. `db:bootstrap` is the same statement, run by hand
(`package.json`'s script inlines `scripts/bootstrap-db.sql` through the `pg` client, reading
`DIRECT_URL` before `DATABASE_URL`, same as this file's own convention). Skip it and `migrate
deploy` does not fail quietly: it stops on the first migration that references a missing object,
and every migration after that one stays unapplied, which Section 4's `pg_restore` then meets as a
target with no tables to restore data into.

## 3. Dump the source

```bash
export SOURCE="<the DIRECT_URL from .env.local>"
pg_dump "$SOURCE" --format=custom --no-owner --no-privileges --schema=public --file=cecodes.dump
```

`pg_dump` only reads, so this is safe to rehearse against production. `--schema=public` is what
excludes the `auth` schema Section 1 describes; it is never named on the command line and never
touched. `--format=custom` is not cosmetic: it is what lets Section 4's `pg_restore` run
`--data-only` and `--disable-triggers` at all, and it is what makes a re-run cheap, since only a
custom-format archive supports selective, parallel restore.

## 4. Restore

```bash
pg_restore --dbname="$TARGET" --no-owner --no-privileges --data-only --disable-triggers cecodes.dump
```

`--no-owner` and `--no-privileges` matter because the Supabase roles the dump remembers
(`supabase_admin`, `anon`, `service_role`, `authenticated`'s original grants) do not exist as
Supabase created them on the target; without these flags every `ALTER ... OWNER TO` and `GRANT`
statement in the archive fails and aborts the restore partway through a table. `--data-only`
because Section 2 already created every table, index and constraint by replaying the real
migrations; restoring structure here as well would either collide with what migration already made
or, worse, drift from it. `--disable-triggers` lets `COPY` load each table's rows without firing
foreign-key triggers per row, so tables can load in the archive's own order without failing on a
parent row that has not landed yet. It requires owning the tables being loaded, which the
connecting role already does, because it is the same role that ran `migrate deploy` in Section 2.

## 5. Verify row counts

```bash
QUERY="SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY relname;"
psql "$SOURCE" -At -c "$QUERY" > counts-source.txt
psql "$TARGET" -At -c "ANALYZE; $QUERY" > counts-target.txt
diff counts-source.txt counts-target.txt && echo "row counts match"
```

A count that differs by even one row means stop, do not proceed to Section 6, and find the missing
rows before touching production again. `$SOURCE`'s query runs with no `ANALYZE` first and never
will: this file never issues a write, not even a statistics refresh, against the shared production
database. `$TARGET`'s query runs `ANALYZE` first because a bulk `COPY` load does not itself update
`pg_stat_user_tables`, and an un-analyzed target would compare a real count against a stale zero.
`n_live_tup` is a planner statistic, not `count(*)`; for tables the size of this project's it is
exact immediately after `ANALYZE` (which reads every row of a table smaller than its sampling
threshold), but if any row ever looks off, confirm with `SELECT count(*) FROM public.<table>` on
both sides before deciding it is real drift rather than a stale estimate.

## 6. Cut over

```bash
docker compose stop app
# repeat steps 3-5 against a freshly emptied target
docker compose up -d          # with DATABASE_URL now naming the target in .env
```

Stop only `app`, not `db` or `mailpit`: the point is that nothing writes to `$SOURCE` between the
final dump and the restore it feeds, not that the whole stack goes dark. Then repeat Sections 3
through 5 for real, one last time, so the data that lands is whatever was true the instant the app
stopped writing.

"Freshly emptied target" matters because `pg_restore --data-only` inserts rows; it does not
upsert. Restoring into a target that already holds an earlier rehearsal's data collides on the
same primary keys and unique constraints (`user_sessions.tokenHash`, `password_reset_tokens.id`,
and every table's primary key) and `pg_restore` aborts partway rather than overwriting anything.
Empty it one of two ways: if the target is disposable, remove its volume and repeat Section 2 from
nothing; if it is not, truncate every `public` table first:

```bash
psql "$TARGET" -At -c "SELECT tablename FROM pg_tables WHERE schemaname='public'" \
  | xargs -I{} psql "$TARGET" -c 'TRUNCATE TABLE public."{}" RESTART IDENTITY CASCADE'
```

Before the final `docker compose up -d`, update **both** `DATABASE_URL` and `DIRECT_URL` in
`.env` to name `$TARGET`, not just `DATABASE_URL`. `docker-compose.yml` defaults `DIRECT_URL` to
whatever `DATABASE_URL` resolves to only when `.env` leaves `DIRECT_URL` unset; if `.env` already
has an explicit `DIRECT_URL` line pointing at Supabase (as `.env.example` sets both explicitly),
leaving it there means the next `init` run replays migrations against Supabase while `app` queries
the target, which is two different databases disagreeing about what schema exists.

Sign in, open the dashboard, and download one report before telling anyone it is done.

## 7. Rollback

Put the old `DATABASE_URL` and `DIRECT_URL` back in `.env` and run `docker compose up -d`. Nothing
on Supabase was ever modified at any point in this procedure: every command that touches `$SOURCE`
in Sections 3 through 6 only reads from it, so the rollback is complete rather than partial. The
only production-facing change this whole runbook makes is stopping and restarting the `app`
container in Section 6, which this step also undoes.
