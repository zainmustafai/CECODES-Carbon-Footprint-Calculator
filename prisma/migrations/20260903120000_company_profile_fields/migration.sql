-- Client feedback 2026-09-03 (D5): "please use company information as header, I mean the first
-- thing the user will visualize is their information."
--
-- src/features/reports/lib/build-pdf.tsx has rendered NIT, colaboradores, responsable, cargo,
-- telefono and sitio web since that round, but toCompanyProfile hardcoded all six to null
-- because the columns did not exist, so the header always omitted them.
--
-- All six are nullable with no default: every company predates them, and the header prints only
-- the fields that are filled rather than showing a blank label.
--
-- `nit` is the Colombian tax id and is deliberately NOT unique. Legacy rows may repeat or omit
-- it, and a plain unique index treats two NULLs as distinct anyway, so it would not enforce what
-- it looks like it enforces (IMPLEMENTATION.md section 11).

ALTER TABLE "companies" ADD COLUMN "nit" TEXT;
ALTER TABLE "companies" ADD COLUMN "employeeCount" INTEGER;
ALTER TABLE "companies" ADD COLUMN "contactName" TEXT;
ALTER TABLE "companies" ADD COLUMN "contactRole" TEXT;
ALTER TABLE "companies" ADD COLUMN "contactPhone" TEXT;
ALTER TABLE "companies" ADD COLUMN "website" TEXT;
