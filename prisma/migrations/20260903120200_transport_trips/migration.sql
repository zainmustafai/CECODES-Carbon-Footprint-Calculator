-- Client feedback 2026-09-03 (E3): "C4, C6, C7 and C9 need a way to register pasajero*km and
-- vehiculo*km. Use a template for this, let me know if it's better in excel or not."
--
-- One row per route under an activity entry, so the tool multiplies each route and adds the
-- results instead of asking the user to pre-multiply by hand. The four reference workbooks
-- CECODES sent are exactly this shape: a reference name, a count, a distance, and observations.
--
-- A child table rather than more activity_entries rows: that table is uniquely keyed by
-- (reportingYearId, emissionFactorId, month) plus a partial unique index for the annual rows, so
-- N sibling rows per source are physically impossible there.

-- Backs the composite foreign key below, exactly as reporting_years(id, companyId) backs the one
-- from activity_entries.
CREATE UNIQUE INDEX "activity_entries_id_companyId_key"
  ON "activity_entries"("id", "companyId");

CREATE TABLE "transport_trips" (
    "id" TEXT NOT NULL,
    "activityEntryId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "reference" TEXT,
    "count" DECIMAL(20,6) NOT NULL,
    "distanceKm" DECIMAL(20,6) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_trips_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transport_trips_activityEntryId_position_key"
  ON "transport_trips"("activityEntryId", "position");
CREATE INDEX "transport_trips_activityEntryId_idx" ON "transport_trips"("activityEntryId");
CREATE INDEX "transport_trips_companyId_idx" ON "transport_trips"("companyId");

-- Composite FK: companyId is bound to the entry, so a spoofed companyId matches nothing. Same
-- shape as activity_entries -> reporting_years.
ALTER TABLE "transport_trips" ADD CONSTRAINT "transport_trips_activityEntryId_companyId_fkey"
  FOREIGN KEY ("activityEntryId", "companyId") REFERENCES "activity_entries"("id", "companyId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- A count or a distance may be zero (a reported zero is an answer) but never negative. Both
-- columns are NOT NULL, so this can never evaluate to NULL - and a CHECK that evaluates to NULL
-- PASSES, which is the hole the month/scope check had to be rewritten for in
-- 20260710120200_fix_month_scope_check.
ALTER TABLE "transport_trips" ADD CONSTRAINT "transport_trips_non_negative"
  CHECK ("count" >= 0 AND "distanceKm" >= 0);

-- RLS: inert through Prisma, which connects as the table owner (IMPLEMENTATION.md section 8), but
-- present for any future non-Prisma access path. Mirrors activity_entries exactly.
ALTER TABLE public.transport_trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transport_trips select" ON public.transport_trips FOR SELECT TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "transport_trips insert" ON public.transport_trips FOR INSERT TO authenticated
  WITH CHECK ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "transport_trips update" ON public.transport_trips FOR UPDATE TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() )
  WITH CHECK ( "companyId" = private.current_company_id() OR private.is_admin() );
CREATE POLICY "transport_trips delete" ON public.transport_trips FOR DELETE TO authenticated
  USING ( "companyId" = private.current_company_id() OR private.is_admin() );

-- Extend COUNT_TIMES_DISTANCE to the eight "ton * km" factors (C4 and C9 freight by tonnage).
-- The 20260815120000 backfill covered only 'pasajeros * km' and 'vehículo * km', so C4 and C9
-- freight has been forcing the user to pre-multiply. Verified against the official Emission
-- Factors sheet: the only units containing "km" are 'pasajeros * km' (6 rows), 'ton * km' (8) and
-- 'vehículo * km' (11), plus 'km tubería' (4), which is a plain length and is NOT matched here.
UPDATE "emission_factors" SET "entryMode" = 'COUNT_TIMES_DISTANCE'
  WHERE "unit" = 'ton * km' AND "entryMode" = 'QUANTITY';

-- Move every value already reported against a COUNT_TIMES_DISTANCE source into its first trip, so
-- nothing entered is lost and the new screen opens on the user's own data. Entries never reported
-- stay empty. secondaryValue is 1 for the rows backfilled by
-- fix-2026-08-15-scope3-entry-modes-demo-data.ts, which stays correct here: count x 1.
INSERT INTO "transport_trips" ("id", "activityEntryId", "companyId", "position", "reference", "count", "distanceKm", "note", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  ae."id",
  ae."companyId",
  0,
  NULL,
  ae."value",
  COALESCE(ae."secondaryValue", 1),
  NULL,
  NOW(),
  NOW()
FROM "activity_entries" ae
JOIN "emission_factors" ef ON ef."id" = ae."emissionFactorId"
WHERE ef."entryMode" = 'COUNT_TIMES_DISTANCE'
  AND ae."value" IS NOT NULL;

-- Establish the invariant the save action maintains from here: for a source that has trips,
-- `value` is the SUM OF THE PRODUCTS and `secondaryValue` is 1. That keeps the legacy
-- value x secondaryValue path in exact agreement with the trip path, so the two can never
-- disagree, and it means every existing reader of `value` (completeness counts, the entered-
-- activity column, "was this reported") keeps working without knowing trips exist.
UPDATE "activity_entries" ae
SET "value" = t."total", "secondaryValue" = 1
FROM (
  SELECT "activityEntryId", SUM("count" * "distanceKm") AS "total"
  FROM "transport_trips"
  GROUP BY "activityEntryId"
) t
WHERE t."activityEntryId" = ae."id";
