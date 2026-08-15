-- Client feedback 2026-08-15, Dashboard and reports > Visualizations: "For the 'emisiones por
-- gases' chart, please include all of the gases separately when reported. This means not only
-- CO2, CH4, N2O and others but specify those 'other' such SF6, NF3, etc."
--
-- gasType records which gas a pre-blended (co2eFactor-only) factor actually is - SF6, PFC, HFC,
-- NF3, as identified by which column of the factor workbook carried the value (see
-- src/lib/factor-import/map-row.ts). Free text, not an enum: the workbook identifies only the
-- column, not a small fixed set of compounds, and a future revision may add columns for specific
-- blends without a migration. Backfilled by a re-run of prisma/import-factors.ts immediately
-- after this migration; left null on every per-gas factor and on any pre-blended factor whose
-- sheet column could not be identified (e.g. a spend/distance-based Scope 3 line).

-- AlterTable
ALTER TABLE "emission_factors" ADD COLUMN     "gasType" TEXT;
