-- Revert SUPER_ADMIN: the seeded admin is a regular CECODES_ADMIN.

-- Demote any super admins to regular admins.
UPDATE public.app_users SET role = 'CECODES_ADMIN' WHERE role::text = 'SUPER_ADMIN';

-- Recreate the Role enum without SUPER_ADMIN (Postgres can't DROP an enum value).
ALTER TABLE public.app_users ALTER COLUMN role DROP DEFAULT;
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('COMPANY_USER', 'CECODES_ADMIN');
ALTER TABLE public.app_users
  ALTER COLUMN role TYPE "Role" USING role::text::"Role";
ALTER TABLE public.app_users ALTER COLUMN role SET DEFAULT 'COMPANY_USER';
DROP TYPE "Role_old";

-- Restore is_admin() to CECODES_ADMIN only and drop the super-admin helper.
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
      AND role::text = 'CECODES_ADMIN'
  )
$$;

DROP FUNCTION IF EXISTS private.is_super_admin();
