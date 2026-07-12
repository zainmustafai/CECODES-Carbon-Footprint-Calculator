-- Data entry: nullable activity values, category applicability, and the integrity
-- constraints the application can no longer be the only guardian of.
--
-- Prisma connects as the database owner and bypasses RLS, so server code is the primary
-- isolation boundary. These constraints are the backstop that makes corrupt states
-- unrepresentable rather than merely unreached.

-- ---------------------------------------------------------------------------
-- 1. Activity values become nullable.
--    NULL = "not reported yet". 0 = "genuinely zero consumption".
--    Both contribute 0 to the total, but only the second is an answer, and Scope 2 needs
--    the distinction to report "8 de 12 meses".
-- ---------------------------------------------------------------------------
ALTER TABLE "activity_entries" ALTER COLUMN "value" DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Category applicability (the "¿Aplica?" toggle).
-- ---------------------------------------------------------------------------
CREATE TABLE "category_applicability" (
    "id" TEXT NOT NULL,
    "reportingYearId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "scope" "Scope" NOT NULL,
    "category" TEXT NOT NULL,
    "applies" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_applicability_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "category_applicability_companyId_idx" ON "category_applicability"("companyId");
CREATE UNIQUE INDEX "category_applicability_reportingYearId_scope_category_key" ON "category_applicability"("reportingYearId", "scope", "category");

ALTER TABLE "category_applicability" ADD CONSTRAINT "category_applicability_reportingYearId_fkey"
  FOREIGN KEY ("reportingYearId") REFERENCES "reporting_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Uniqueness.
-- ---------------------------------------------------------------------------
CREATE INDEX "activity_entries_reportingYearId_companyId_idx" ON "activity_entries"("reportingYearId", "companyId");

-- Dedupes the 12 Scope-2 month rows for a source. Postgres treats NULLs as distinct, so
-- this index does nothing for the annual (month IS NULL) rows.
CREATE UNIQUE INDEX "activity_entries_reportingYearId_emissionFactorId_month_key" ON "activity_entries"("reportingYearId", "emissionFactorId", "month");

-- ...which is what this partial index is for: one annual row per source per year.
-- Predicated on emissionFactorId IS NOT NULL so that rows orphaned by ON DELETE SET NULL
-- do not collide with one another.
CREATE UNIQUE INDEX "activity_entries_annual_source_key"
  ON "activity_entries" ("reportingYearId", "emissionFactorId")
  WHERE "month" IS NULL AND "emissionFactorId" IS NOT NULL;

CREATE UNIQUE INDEX "facilities_companyId_name_key" ON "facilities"("companyId", "name");
CREATE UNIQUE INDEX "reporting_years_id_companyId_key" ON "reporting_years"("id", "companyId");

-- ---------------------------------------------------------------------------
-- 4. Cross-row integrity: an entry cannot claim one company while its reporting year
--    belongs to another. `companyId` is denormalized on activity_entries with no foreign
--    key, so this state was previously storable. It would double-count in the victim's
--    totals. The composite FK (backed by the unique index above) makes it impossible.
--    The single-column FK stays so the Prisma relation keeps its own constraint.
-- ---------------------------------------------------------------------------
ALTER TABLE "activity_entries" ADD CONSTRAINT "activity_entries_reportingYear_company_fkey"
  FOREIGN KEY ("reportingYearId", "companyId") REFERENCES "reporting_years"("id", "companyId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 5. Domain invariants that were previously only a schema comment.
-- ---------------------------------------------------------------------------
ALTER TABLE "activity_entries" ADD CONSTRAINT "activity_entries_month_scope_check" CHECK (
  ("scope" = 'SCOPE_2' AND "month" BETWEEN 1 AND 12)
  OR ("scope" IN ('SCOPE_1', 'SCOPE_3') AND "month" IS NULL)
);

-- Values may be decimal and may be zero, but never negative. NULL passes (not reported).
ALTER TABLE "activity_entries" ADD CONSTRAINT "activity_entries_value_nonneg_check" CHECK (
  "value" IS NULL OR "value" >= 0
);

-- ---------------------------------------------------------------------------
-- 6. RLS for the new table, mirroring activity_entries. Inert while Prisma connects as
--    the owner; kept consistent as defense in depth for any non-Prisma access path.
-- ---------------------------------------------------------------------------
ALTER TABLE public.category_applicability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "category_applicability select" ON public.category_applicability FOR SELECT TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "category_applicability insert" ON public.category_applicability FOR INSERT TO authenticated
  WITH CHECK ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "category_applicability update" ON public.category_applicability FOR UPDATE TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() )
  WITH CHECK ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "category_applicability delete" ON public.category_applicability FOR DELETE TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() );
