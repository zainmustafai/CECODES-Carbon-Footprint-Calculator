-- Client feedback 2026-09-03 (E4): "gas and diesel prices table, but again I need to be able to
-- add them from admin user. Let me know if you can add the files or if it's better to add a new
-- table for this."
--
-- Until now transport_subsidy_prices held ONE price per year, and BOTH C6 "Subsidios de
-- transporte" factors divided by it, so diesel was priced at the gasoline price. The official
-- Emission Factors sheet has exactly two such elements, both with unit "gal":
--   C6: Gasolina E10 (Comercial) - Movil
--   C6: Diesel B10 (Mezcla comercial) - Movil
--
-- Three changes, in order: a typed fuel column on the factor so the engine knows which price to
-- use; one price row per fuel per year; and a wider money column, because the averages CECODES
-- themselves supplied carry twelve decimal places and DECIMAL(20,2) rejected them outright.

CREATE TYPE "FuelType" AS ENUM ('GASOLINE', 'DIESEL');

ALTER TABLE "emission_factors" ADD COLUMN "fuelType" "FuelType";

-- Add the column nullable, name what the existing rows always were, then make it NOT NULL. No
-- row is invented and none is lost.
ALTER TABLE "transport_subsidy_prices" ADD COLUMN "fuel" "FuelType";
UPDATE "transport_subsidy_prices" SET "fuel" = 'GASOLINE' WHERE "fuel" IS NULL;
ALTER TABLE "transport_subsidy_prices" ALTER COLUMN "fuel" SET NOT NULL;

-- Widening only: every stored value keeps its exact digits.
ALTER TABLE "transport_subsidy_prices"
  ALTER COLUMN "pricePerGallonCop" TYPE DECIMAL(20,6);

DROP INDEX "transport_subsidy_prices_year_key";
CREATE UNIQUE INDEX "transport_subsidy_prices_year_fuel_key"
  ON "transport_subsidy_prices"("year", "fuel");

-- Backfill the two subsidy factors. Matching on a substring of the element is a ONE-TIME data
-- correction, exactly as the entryMode backfill in 20260815120000 was; from here fuelType is what
-- the app branches on, and src/lib/calc/fuel.ts is what keeps it correct through a re-import.
-- ILIKE '%diesel%' would not match "Diesel" written with its accent, so both spellings are listed.
UPDATE "emission_factors" SET "fuelType" = 'GASOLINE'
  WHERE "entryMode" = 'MONEY_PER_GALLON' AND "element" ILIKE '%gasolina%';

UPDATE "emission_factors" SET "fuelType" = 'DIESEL'
  WHERE "entryMode" = 'MONEY_PER_GALLON'
    AND ("element" ILIKE '%diésel%' OR "element" ILIKE '%diesel%');

-- The national average prices CECODES supplied in "C6 - Viajes de negocios.xlsx", sheet
-- "(C6) Viajes y subsidios", columns N/O/P, rounded to the column's six decimals.
-- ON CONFLICT DO NOTHING so a price an admin has already entered is never overwritten by a
-- re-deploy, and so this migration stays safe to replay.
INSERT INTO "transport_subsidy_prices" ("id", "year", "fuel", "pricePerGallonCop", "source", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 2024, 'GASOLINE', 16046.315789, 'CECODES, C6 - Viajes de negocios.xlsx (promedio nacional)', NOW(), NOW()),
  (gen_random_uuid()::text, 2024, 'DIESEL',    9574.157895, 'CECODES, C6 - Viajes de negocios.xlsx (promedio nacional)', NOW(), NOW()),
  (gen_random_uuid()::text, 2025, 'GASOLINE', 15663.157895, 'CECODES, C6 - Viajes de negocios.xlsx (promedio nacional)', NOW(), NOW()),
  (gen_random_uuid()::text, 2025, 'DIESEL',   10646.473684, 'CECODES, C6 - Viajes de negocios.xlsx (promedio nacional)', NOW(), NOW())
ON CONFLICT ("year", "fuel") DO NOTHING;
