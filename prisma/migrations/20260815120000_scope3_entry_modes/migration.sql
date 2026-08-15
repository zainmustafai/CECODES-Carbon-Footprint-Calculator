-- Client feedback 2026-08-15: Scope 3 Categoria 6 "Subsidios de transporte" is reported in COP,
-- not gallons, converted via a yearly average price per gallon; Categoria 6/7 distance categories
-- (unit "pasajeros * km" / "vehiculo * km") are reported as a separate count and distance,
-- multiplied. EntryMode marks which derivation a factor needs (default QUANTITY, today's
-- unchanged behavior for every existing factor); secondaryValue holds the distance half of a
-- COUNT_TIMES_DISTANCE entry; transport_subsidy_prices is the new yearly reference table.

-- CreateEnum
CREATE TYPE "EntryMode" AS ENUM ('QUANTITY', 'MONEY_PER_GALLON', 'COUNT_TIMES_DISTANCE');

-- AlterTable
ALTER TABLE "activity_entries" ADD COLUMN     "secondaryValue" DECIMAL(20,6);

-- AlterTable
ALTER TABLE "emission_factors" ADD COLUMN     "entryMode" "EntryMode" NOT NULL DEFAULT 'QUANTITY';

-- CreateTable
CREATE TABLE "transport_subsidy_prices" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "pricePerGallonCop" DECIMAL(20,2) NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedByEmail" TEXT,

    CONSTRAINT "transport_subsidy_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transport_subsidy_prices_year_key" ON "transport_subsidy_prices"("year");

-- RLS: defence in depth for a future non-Prisma access path (Prisma itself bypasses RLS as the
-- table owner - see IMPLEMENTATION.md §8). Global reference data, same policy shape as
-- grid_electricity_factors: any authenticated user reads, only an admin writes.
ALTER TABLE public.transport_subsidy_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transport_subsidy_prices read" ON public.transport_subsidy_prices
  FOR SELECT TO authenticated USING ( true );
CREATE POLICY "transport_subsidy_prices admin write" ON public.transport_subsidy_prices
  FOR ALL TO authenticated USING ( private.is_admin() ) WITH CHECK ( private.is_admin() );

-- Backfill: mark the existing Scope 3 factor rows this feature applies to. Regular string
-- matching would be fragile (see the HCFC-22/R-290 subcategory-spelling bug fixed this same
-- round); this backfill is a one-time data correction, not the ongoing identification mechanism -
-- entryMode is what the app actually branches on from here.
UPDATE "emission_factors" SET "entryMode" = 'MONEY_PER_GALLON'
  WHERE "scope" = 'SCOPE_3' AND "category" = 'C6: Viajes de negocios'
    AND "subcategory" = 'Subsidios de transporte';

UPDATE "emission_factors" SET "entryMode" = 'COUNT_TIMES_DISTANCE'
  WHERE "unit" IN ('pasajeros * km', 'vehículo * km');
