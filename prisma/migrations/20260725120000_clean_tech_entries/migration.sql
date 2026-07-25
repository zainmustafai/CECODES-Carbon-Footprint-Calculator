-- "Datos sobre tecnologías más limpias y buenas prácticas" (CECODES, 2026-07-24): an OPEN,
-- free-form reporting section. Rows never feed the calculation engine; they appear only on the
-- Resumen and in exports. See the CleanTechEntry comments in prisma/schema.prisma.

-- CreateTable
CREATE TABLE "clean_tech_entries" (
    "id" TEXT NOT NULL,
    "reportingYearId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "scope" "Scope",
    "category" TEXT,
    "subcategory" TEXT,
    "element" TEXT NOT NULL,
    "quantity" DECIMAL(20,6),
    "unit" TEXT,
    "createdByEmail" TEXT,
    "updatedByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clean_tech_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clean_tech_entries_reportingYearId_idx" ON "clean_tech_entries"("reportingYearId");

-- CreateIndex
CREATE INDEX "clean_tech_entries_companyId_idx" ON "clean_tech_entries"("companyId");

-- AddForeignKey: composite FK binds companyId to the reporting year, exactly as
-- activity_entries does, so a spoofed companyId matches nothing. Cascade so a deleted year
-- takes its free-form rows with it.
ALTER TABLE "clean_tech_entries" ADD CONSTRAINT "clean_tech_entries_reportingYearId_companyId_fkey" FOREIGN KEY ("reportingYearId", "companyId") REFERENCES "reporting_years"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security, mirroring activity_entries. RLS is inert through Prisma (the app
-- connects as the owner), so this is defense-in-depth, not the live isolation boundary.
ALTER TABLE public.clean_tech_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clean_tech_entries select" ON public.clean_tech_entries FOR SELECT TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "clean_tech_entries insert" ON public.clean_tech_entries FOR INSERT TO authenticated
  WITH CHECK ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "clean_tech_entries update" ON public.clean_tech_entries FOR UPDATE TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() )
  WITH CHECK ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "clean_tech_entries delete" ON public.clean_tech_entries FOR DELETE TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() );
