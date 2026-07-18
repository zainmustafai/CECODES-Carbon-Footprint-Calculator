-- Traceability: per-user contact/identity fields, and an append-only audit trail for data entry.
-- CECODES requirement (2026-07-18): with several people per company, a wrong figure must point
-- back to a person. See prisma/schema.prisma comments on AppUser and ActivityEntryChange.

-- CreateEnum
CREATE TYPE "EntryChangeAction" AS ENUM ('SOURCE_ADDED', 'VALUE_SET', 'VALUE_CLEARED', 'COPIED', 'SOURCE_REMOVED');

-- AlterTable: identity/contact for AppUser. Nullable so existing rows and the email+password
-- /register flow are unaffected.
ALTER TABLE "app_users" ADD COLUMN     "name" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "position" TEXT;

-- CreateTable: the data-entry audit log. Not FK'd to activity_entries on purpose; it must
-- outlive the rows it describes (removeSource hard-deletes them). Keyed by natural coordinates
-- plus a denormalized element label and actor email.
CREATE TABLE "activity_entry_changes" (
    "id" TEXT NOT NULL,
    "reportingYearId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "emissionFactorId" TEXT,
    "scope" "Scope" NOT NULL,
    "element" TEXT NOT NULL,
    "month" INTEGER,
    "changedById" TEXT,
    "changedByEmail" TEXT NOT NULL,
    "action" "EntryChangeAction" NOT NULL,
    "changes" JSONB NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_entry_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_entry_changes_reportingYearId_changedAt_idx" ON "activity_entry_changes"("reportingYearId", "changedAt");

-- CreateIndex
CREATE INDEX "activity_entry_changes_companyId_changedAt_idx" ON "activity_entry_changes"("companyId", "changedAt");

-- CreateIndex
CREATE INDEX "activity_entry_changes_reportingYearId_emissionFactorId_mon_idx" ON "activity_entry_changes"("reportingYearId", "emissionFactorId", "month");

-- AddForeignKey: composite FK binds companyId to the reporting year, exactly as activity_entries
-- does, so a spoofed companyId matches nothing. Cascade so a deleted year takes its audit with it.
ALTER TABLE "activity_entry_changes" ADD CONSTRAINT "activity_entry_changes_reportingYearId_companyId_fkey" FOREIGN KEY ("reportingYearId", "companyId") REFERENCES "reporting_years"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: the actor. SetNull so deleting a user does not erase the audit row that names them.
ALTER TABLE "activity_entry_changes" ADD CONSTRAINT "activity_entry_changes_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security, mirroring activity_entries for consistency. RLS is inert through Prisma
-- (the app connects as the owner), so this is defense-in-depth, not the live isolation boundary.
-- Only SELECT and INSERT: the log is append-only, so no UPDATE/DELETE policy exists and RLS
-- default-denies editing or deleting an audit row.
ALTER TABLE public.activity_entry_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_entry_changes select" ON public.activity_entry_changes FOR SELECT TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "activity_entry_changes insert" ON public.activity_entry_changes FOR INSERT TO authenticated
  WITH CHECK ( "companyId" = private.current_company_id() OR private.is_admin() );
