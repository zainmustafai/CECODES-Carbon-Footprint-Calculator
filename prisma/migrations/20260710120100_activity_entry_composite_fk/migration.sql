-- Make the composite foreign key the ONLY link from activity_entries to reporting_years,
-- and give it the name Prisma derives from the relation, so the schema fully owns it and
-- `migrate diff` reports no drift.
--
-- The single-column FK is now redundant: (reportingYearId, companyId) already guarantees
-- reportingYearId exists, and it additionally guarantees the denormalized companyId agrees
-- with the parent.

ALTER TABLE "activity_entries" DROP CONSTRAINT "activity_entries_reportingYearId_fkey";

ALTER TABLE "activity_entries"
  RENAME CONSTRAINT "activity_entries_reportingYear_company_fkey"
  TO "activity_entries_reportingYearId_companyId_fkey";
