-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Scope" AS ENUM ('SCOPE_1', 'SCOPE_2', 'SCOPE_3');

-- CreateEnum
CREATE TYPE "GwpSet" AS ENUM ('AR5', 'AR6');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('COMPANY_USER', 'CECODES_ADMIN');

-- CreateTable
CREATE TABLE "app_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'COMPANY_USER',
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sector" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facilities" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reporting_years" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "gwpSet" "GwpSet" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reporting_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_entries" (
    "id" TEXT NOT NULL,
    "reportingYearId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "emissionFactorId" TEXT,
    "scope" "Scope" NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "element" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "month" INTEGER,
    "value" DECIMAL(20,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scope_targets" (
    "id" TEXT NOT NULL,
    "reportingYearId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "scope" "Scope" NOT NULL,
    "targetTonnes" DECIMAL(20,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scope_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emission_factor_versions" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "preparedBy" TEXT,
    "reviewedBy" TEXT,
    "authorizedBy" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emission_factor_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emission_factors" (
    "id" TEXT NOT NULL,
    "scope" "Scope" NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "element" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "co2Factor" DECIMAL(30,10),
    "ch4Factor" DECIMAL(30,10),
    "n2oFactor" DECIMAL(30,10),
    "co2eFactor" DECIMAL(30,10),
    "co2eFactorCop" DECIMAL(30,10),
    "co2eFactorUsd" DECIMAL(30,10),
    "factorUnit" TEXT,
    "source" TEXT,
    "gwpSet" "GwpSet",
    "biogenic" BOOLEAN NOT NULL DEFAULT false,
    "uncertaintyPct" DECIMAL(10,4),
    "effectiveYear" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "versionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emission_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grid_electricity_factors" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "factor" DECIMAL(30,10) NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grid_electricity_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_snapshots" (
    "id" TEXT NOT NULL,
    "reportingYearId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "scope" "Scope" NOT NULL,
    "category" TEXT,
    "tonnesCo2e" DECIMAL(20,6) NOT NULL,
    "biogenicTonnes" DECIMAL(20,6),
    "factorVersionId" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_users_email_key" ON "app_users"("email");

-- CreateIndex
CREATE INDEX "app_users_companyId_idx" ON "app_users"("companyId");

-- CreateIndex
CREATE INDEX "facilities_companyId_idx" ON "facilities"("companyId");

-- CreateIndex
CREATE INDEX "reporting_years_companyId_idx" ON "reporting_years"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "reporting_years_facilityId_year_key" ON "reporting_years"("facilityId", "year");

-- CreateIndex
CREATE INDEX "activity_entries_reportingYearId_scope_idx" ON "activity_entries"("reportingYearId", "scope");

-- CreateIndex
CREATE INDEX "activity_entries_companyId_idx" ON "activity_entries"("companyId");

-- CreateIndex
CREATE INDEX "activity_entries_emissionFactorId_idx" ON "activity_entries"("emissionFactorId");

-- CreateIndex
CREATE INDEX "scope_targets_companyId_idx" ON "scope_targets"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "scope_targets_reportingYearId_scope_key" ON "scope_targets"("reportingYearId", "scope");

-- CreateIndex
CREATE INDEX "emission_factors_scope_category_subcategory_idx" ON "emission_factors"("scope", "category", "subcategory");

-- CreateIndex
CREATE INDEX "emission_factors_versionId_idx" ON "emission_factors"("versionId");

-- CreateIndex
CREATE INDEX "emission_factors_active_idx" ON "emission_factors"("active");

-- CreateIndex
CREATE UNIQUE INDEX "grid_electricity_factors_year_key" ON "grid_electricity_factors"("year");

-- CreateIndex
CREATE INDEX "result_snapshots_reportingYearId_idx" ON "result_snapshots"("reportingYearId");

-- CreateIndex
CREATE INDEX "result_snapshots_companyId_idx" ON "result_snapshots"("companyId");

-- AddForeignKey
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_years" ADD CONSTRAINT "reporting_years_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_entries" ADD CONSTRAINT "activity_entries_reportingYearId_fkey" FOREIGN KEY ("reportingYearId") REFERENCES "reporting_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_entries" ADD CONSTRAINT "activity_entries_emissionFactorId_fkey" FOREIGN KEY ("emissionFactorId") REFERENCES "emission_factors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scope_targets" ADD CONSTRAINT "scope_targets_reportingYearId_fkey" FOREIGN KEY ("reportingYearId") REFERENCES "reporting_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emission_factors" ADD CONSTRAINT "emission_factors_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "emission_factor_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_snapshots" ADD CONSTRAINT "result_snapshots_reportingYearId_fkey" FOREIGN KEY ("reportingYearId") REFERENCES "reporting_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

