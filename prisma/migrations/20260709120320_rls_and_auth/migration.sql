-- CECODES — Row-Level Security, tenant helpers, and Supabase auth sync.
-- Applied after the init migration. Column names are camelCase (quoted); tables are snake_case.
-- See docs/CECODES - Tech Stack Decision.md (Prisma + RLS note) and the Supabase RLS checklist.

-- =========================================================================
-- Private helper schema + SECURITY DEFINER functions (NOT exposed via Data API)
-- =========================================================================
CREATE SCHEMA IF NOT EXISTS private;

-- Company of the current user (reads app_users, bypassing RLS via SECURITY DEFINER).
CREATE OR REPLACE FUNCTION private.current_company_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT "companyId" FROM public.app_users WHERE id = (SELECT auth.uid())::text
$$;

-- Whether the current user is a CECODES admin.
CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users
    WHERE id = (SELECT auth.uid())::text AND role = 'CECODES_ADMIN'
  )
$$;

REVOKE ALL ON FUNCTION private.current_company_id() FROM public;
REVOKE ALL ON FUNCTION private.is_admin() FROM public;
GRANT EXECUTE ON FUNCTION private.current_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;

-- =========================================================================
-- Supabase auth -> app_users sync (create a profile row on signup)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.app_users (id, email, role, "updatedAt")
  VALUES (NEW.id::text, COALESCE(NEW.email, NEW.id::text), 'COMPANY_USER', now())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================================
-- Enable RLS on every table in public
-- =========================================================================
ALTER TABLE public.app_users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facilities               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reporting_years          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_entries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scope_targets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.result_snapshots         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emission_factors         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emission_factor_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grid_electricity_factors ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- Identity policies
-- =========================================================================
CREATE POLICY "app_users self select" ON public.app_users
  FOR SELECT TO authenticated
  USING ( id = (SELECT auth.uid())::text OR private.is_admin() );

CREATE POLICY "app_users self update" ON public.app_users
  FOR UPDATE TO authenticated
  USING ( id = (SELECT auth.uid())::text )
  WITH CHECK ( id = (SELECT auth.uid())::text );

-- =========================================================================
-- Company policies
-- =========================================================================
CREATE POLICY "companies select own" ON public.companies
  FOR SELECT TO authenticated
  USING ( id = private.current_company_id() OR private.is_admin() );

CREATE POLICY "companies update own" ON public.companies
  FOR UPDATE TO authenticated
  USING ( id = private.current_company_id() OR private.is_admin() )
  WITH CHECK ( id = private.current_company_id() OR private.is_admin() );

CREATE POLICY "companies insert admin" ON public.companies
  FOR INSERT TO authenticated
  WITH CHECK ( private.is_admin() );

-- =========================================================================
-- Tenant-table policies (company-scoped). Uniform CRUD on "companyId".
-- =========================================================================
-- facilities
CREATE POLICY "facilities select" ON public.facilities FOR SELECT TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "facilities insert" ON public.facilities FOR INSERT TO authenticated
  WITH CHECK ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "facilities update" ON public.facilities FOR UPDATE TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() )
  WITH CHECK ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "facilities delete" ON public.facilities FOR DELETE TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() );

-- reporting_years
CREATE POLICY "reporting_years select" ON public.reporting_years FOR SELECT TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "reporting_years insert" ON public.reporting_years FOR INSERT TO authenticated
  WITH CHECK ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "reporting_years update" ON public.reporting_years FOR UPDATE TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() )
  WITH CHECK ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "reporting_years delete" ON public.reporting_years FOR DELETE TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() );

-- activity_entries
CREATE POLICY "activity_entries select" ON public.activity_entries FOR SELECT TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "activity_entries insert" ON public.activity_entries FOR INSERT TO authenticated
  WITH CHECK ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "activity_entries update" ON public.activity_entries FOR UPDATE TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() )
  WITH CHECK ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "activity_entries delete" ON public.activity_entries FOR DELETE TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() );

-- scope_targets
CREATE POLICY "scope_targets select" ON public.scope_targets FOR SELECT TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "scope_targets insert" ON public.scope_targets FOR INSERT TO authenticated
  WITH CHECK ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "scope_targets update" ON public.scope_targets FOR UPDATE TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() )
  WITH CHECK ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "scope_targets delete" ON public.scope_targets FOR DELETE TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() );

-- result_snapshots (writes are produced server-side; keep uniform for admin/company access)
CREATE POLICY "result_snapshots select" ON public.result_snapshots FOR SELECT TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "result_snapshots insert" ON public.result_snapshots FOR INSERT TO authenticated
  WITH CHECK ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "result_snapshots update" ON public.result_snapshots FOR UPDATE TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() )
  WITH CHECK ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "result_snapshots delete" ON public.result_snapshots FOR DELETE TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() );

-- =========================================================================
-- Reference-data policies (read: any authenticated user; write: CECODES admin only)
-- =========================================================================
-- emission_factors
CREATE POLICY "emission_factors read" ON public.emission_factors
  FOR SELECT TO authenticated USING ( true );
CREATE POLICY "emission_factors admin write" ON public.emission_factors
  FOR ALL TO authenticated USING ( private.is_admin() ) WITH CHECK ( private.is_admin() );

-- emission_factor_versions
CREATE POLICY "emission_factor_versions read" ON public.emission_factor_versions
  FOR SELECT TO authenticated USING ( true );
CREATE POLICY "emission_factor_versions admin write" ON public.emission_factor_versions
  FOR ALL TO authenticated USING ( private.is_admin() ) WITH CHECK ( private.is_admin() );

-- grid_electricity_factors
CREATE POLICY "grid_electricity_factors read" ON public.grid_electricity_factors
  FOR SELECT TO authenticated USING ( true );
CREATE POLICY "grid_electricity_factors admin write" ON public.grid_electricity_factors
  FOR ALL TO authenticated USING ( private.is_admin() ) WITH CHECK ( private.is_admin() );
