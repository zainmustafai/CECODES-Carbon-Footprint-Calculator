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
