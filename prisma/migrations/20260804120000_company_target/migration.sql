-- Replaces the per-Sede/per-Alcance tonnes "scope_targets" design with a single company-wide
-- reduction percentage. The client's own decision memo (2026-07-28) scoped Meta as ONE
-- company-wide percentage vs. the first reported year, never per-Sede/per-Alcance tonnes; the
-- shipped feature never matched that. The 10 rows in scope_targets at migration time are all
-- demo/seed data (faker-style company names), not real client-entered values, so this is a clean
-- one-way replacement, not a data-preserving migration.

-- DropForeignKey
ALTER TABLE "scope_targets" DROP CONSTRAINT "scope_targets_reportingYearId_fkey";

-- DropTable
DROP TABLE "scope_targets";

-- CreateTable
CREATE TABLE "company_targets" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reductionPct" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_targets_companyId_key" ON "company_targets"("companyId");

-- AddForeignKey
ALTER TABLE "company_targets" ADD CONSTRAINT "company_targets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: defence in depth for a future non-Prisma access path (Prisma itself bypasses RLS as the
-- table owner - see IMPLEMENTATION.md §8). Mirrors every other company-scoped table's policy set.
ALTER TABLE public.company_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_targets select" ON public.company_targets FOR SELECT TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "company_targets insert" ON public.company_targets FOR INSERT TO authenticated
  WITH CHECK ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "company_targets update" ON public.company_targets FOR UPDATE TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() )
  WITH CHECK ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "company_targets delete" ON public.company_targets FOR DELETE TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() );
