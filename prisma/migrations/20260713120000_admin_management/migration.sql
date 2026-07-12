-- Admin management system: user/company deactivation, per-factor audit trail, and the
-- natural key the Excel importer upserts on.
--
-- The first half is `prisma migrate diff` output. The second half is hand written, because
-- Prisma cannot express an expression index or an RLS policy.

-- CreateEnum
CREATE TYPE "FactorChangeAction" AS ENUM ('CREATED', 'UPDATED', 'DEACTIVATED', 'REACTIVATED', 'IMPORTED');

-- AlterTable
ALTER TABLE "app_users" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "contactEmail" TEXT;

-- AlterTable
ALTER TABLE "grid_electricity_factors" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedByEmail" TEXT;

-- CreateTable
CREATE TABLE "emission_factor_changes" (
    "id" TEXT NOT NULL,
    "factorId" TEXT NOT NULL,
    "changedById" TEXT,
    "changedByEmail" TEXT NOT NULL,
    "action" "FactorChangeAction" NOT NULL,
    "changes" JSONB NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emission_factor_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "emission_factor_changes_factorId_changedAt_idx" ON "emission_factor_changes"("factorId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "emission_factor_versions_version_key" ON "emission_factor_versions"("version");

-- AddForeignKey
ALTER TABLE "emission_factor_changes" ADD CONSTRAINT "emission_factor_changes_factorId_fkey" FOREIGN KEY ("factorId") REFERENCES "emission_factors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emission_factor_changes" ADD CONSTRAINT "emission_factor_changes_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =========================================================================
-- Hand written below this line. `prisma migrate diff` cannot generate any of it.
-- =========================================================================

-- The emission-factor natural key, which the Excel importer upserts on.
--
-- A plain UNIQUE (scope, category, subcategory, element, unit) would NOT deduplicate: a
-- NULL subcategory is distinct from every other NULL in a unique index, so the ~500 rows
-- with no subcategory could all be inserted twice. This is the same trap the annual
-- activity_entries partial index exists to close. COALESCE makes the NULLs comparable.
CREATE UNIQUE INDEX "emission_factors_natural_key"
  ON "emission_factors" ("scope", "category", COALESCE("subcategory", ''), "element", "unit");

-- RLS mirror for the new audit table. Prisma connects as the database owner and bypasses
-- all of these, exactly as documented in IMPLEMENTATION.md section 8: they are defence in
-- depth for a future non-Prisma access path, and are kept consistent so the next person who
-- adds a table copies a correct block. They protect nothing today.
ALTER TABLE public.emission_factor_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "emission_factor_changes read" ON public.emission_factor_changes
  FOR SELECT TO authenticated USING ( private.is_admin() );
CREATE POLICY "emission_factor_changes admin write" ON public.emission_factor_changes
  FOR ALL TO authenticated USING ( private.is_admin() ) WITH CHECK ( private.is_admin() );
