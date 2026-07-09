-- Treat SUPER_ADMIN as an admin (inherits all admin RLS access),
-- and add a dedicated super-admin check for top-level control.

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users
    WHERE id = (SELECT auth.uid())::text
      AND role::text IN ('CECODES_ADMIN', 'SUPER_ADMIN')
  )
$$;

CREATE OR REPLACE FUNCTION private.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users
    WHERE id = (SELECT auth.uid())::text
      AND role::text = 'SUPER_ADMIN'
  )
$$;

REVOKE ALL ON FUNCTION private.is_super_admin() FROM public;
GRANT EXECUTE ON FUNCTION private.is_super_admin() TO authenticated;
