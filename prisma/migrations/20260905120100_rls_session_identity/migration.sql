-- Cut the RLS helpers loose from Supabase's auth schema.
--
-- private.current_company_id() and private.is_admin() answer "who is asking" with auth.uid(),
-- which exists only because Supabase's GoTrue installed it. Now that identity lives in app_users
-- and sessions live in user_sessions, that function is the last thing tying the DATABASE to
-- Supabase, and on any other Postgres it does not exist at all.
--
-- The 49 policies that call these two helpers are NOT touched. They keep working, unchanged,
-- because only the body of the helpers changes and their signatures do not.
--
-- WORTH BEING HONEST ABOUT: these policies are inert today and remain inert after this migration.
-- Prisma connects as the table owner and bypasses RLS entirely (IMPLEMENTATION.md section 8), and
-- src/lib/prisma.ts never issues SET LOCAL role. Per-company isolation is enforced in server code,
-- in src/lib/auth/company-scope.ts, and nowhere else. This migration does not change that and must
-- not be read as making RLS load-bearing. It removes a dependency, it does not add a defence.
--
-- The replacement reads a session-scoped setting rather than a function Supabase owns. Nothing
-- sets it today, so every helper answers "nobody", which denies rather than grants: an unset
-- setting must never read as an admin. current_setting(..., true) returns NULL instead of raising
-- when the setting was never set, which is what makes that safe.

-- The 'authenticated' role is Supabase's, and every one of the 49 policies grants to it. Creating
-- it when absent is what lets this schema restore onto a plain Postgres at all: without it, the
-- GRANT below and every CREATE POLICY in the earlier migrations fail on an unknown role. NOLOGIN
-- because nothing signs in as it; it exists to be the grantee the policies name.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$$;

-- The identity of the caller, as this database understands it.
--
-- SET search_path = '' is kept from the original: a SECURITY DEFINER function that resolves
-- unqualified names against the caller's search_path can be hijacked by a caller who puts their
-- own app_users earlier in it.
CREATE OR REPLACE FUNCTION private.current_app_user_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- nullif so that an empty string, which is what a cleared setting looks like, is the same
  -- "nobody" as an unset one rather than an id that matches no row by accident.
  SELECT nullif(current_setting('app.current_user_id', true), '')
$$;

REVOKE ALL ON FUNCTION private.current_app_user_id() FROM public;
GRANT EXECUTE ON FUNCTION private.current_app_user_id() TO authenticated;

-- Company of the current user. Same contract as before, different source of identity.
CREATE OR REPLACE FUNCTION private.current_company_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT "companyId" FROM public.app_users
  WHERE id = private.current_app_user_id()
$$;

-- Whether the current user is a CECODES admin.
--
-- A NULL identity makes the WHERE match nothing, so EXISTS is false and an unauthenticated caller
-- is not an admin. That is the direction this has to fail in.
CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users
    WHERE id = private.current_app_user_id()
      AND role::text = 'CECODES_ADMIN'
  )
$$;

-- The two policies on app_users named auth.uid() directly rather than going through a helper, so
-- they are the only policy bodies that have to be rewritten. Recreated, not merely replaced:
-- Postgres has no CREATE OR REPLACE POLICY.
DROP POLICY IF EXISTS "app_users self select" ON public.app_users;
CREATE POLICY "app_users self select" ON public.app_users
  FOR SELECT TO authenticated
  USING ( id = private.current_app_user_id() OR private.is_admin() );

DROP POLICY IF EXISTS "app_users self update" ON public.app_users;
CREATE POLICY "app_users self update" ON public.app_users
  FOR UPDATE TO authenticated
  USING ( id = private.current_app_user_id() )
  WITH CHECK ( id = private.current_app_user_id() );

-- The signup trigger goes last, because it is the only object here that cannot survive on a
-- database with no auth schema: it fires ON INSERT on auth.users.
--
-- It mirrored a new GoTrue account into app_users. Nothing creates GoTrue accounts any more:
-- src/features/admin/actions/user-actions.ts writes both the credential and the profile in one
-- Postgres transaction, which is something this trigger could never do and which is why a failed
-- createUser used to leave a login-capable account with no company and no way forward.
--
-- Guarded on the TABLE, not just the trigger. DROP TRIGGER IF EXISTS still raises when the
-- relation it names is missing, so on a database that never had a Supabase auth schema the
-- unguarded form would fail here, which is exactly the deployment this migration exists to make
-- possible. to_regclass returns NULL instead of raising for a name that does not resolve.
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users';
  END IF;
END
$$;

DROP FUNCTION IF EXISTS public.handle_new_user();
