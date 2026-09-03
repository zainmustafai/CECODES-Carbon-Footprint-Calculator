# Remaining 03-Sept-2026 Client Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the last three open items of the 03-Sept-2026 feedback (E1 emission-factor correction, E3 transport trip rows for C4/C6/C7/C9, E4 admin-maintained gasoline and diesel prices) plus the company profile fields the D5 report header already renders, leaving nothing open.

**Architecture:** Four workstreams land in order. A adds the six company columns the report header already has rendering branches for. B replaces the single yearly transport price with one price per fuel per year, adds a typed fuel column on the factor so the engine picks the right one, and widens the money column. C adds a `transport_trips` child table under an activity entry so a source can carry N routes, makes the engine sum the products rather than multiplying the sums, and extends `COUNT_TIMES_DISTANCE` to the eight `ton * km` factors that never got it. D hardens the importer (derive `entryMode` and `fuelType`, refuse an unknown flag, validate `--file`), narrows the over-broad travel-factor fix, and then runs the one announced database session that corrects the library.

Every schema change is a hand-authored migration. All four migrations are authored and applied through `bun run db:deploy` against the one shared Supabase database; the data operation in Task 14 is a separate, explicitly announced step.

**Tech Stack:** Next.js 16 App Router, React 19 (compiler on), Prisma 7 + Supabase Postgres, Zod, React Hook Form, next-intl, Vitest, Playwright, bun.

**Spec:** `docs/superpowers/specs/2026-09-03-final-client-feedback-design.md`

## Global Constraints

Copied verbatim from AGENTS.md and IMPLEMENTATION.md. Every task's requirements implicitly include this section.

- **Never use an em dash (U+2014). Anywhere.** `src/__tests__/conventions.test.ts` walks the source and docs trees and fails the suite from a file far from the one you edited.
- **There is ONE shared Supabase database.** Never run `prisma migrate reset`, `TRUNCATE`, or the Prisma MCP `migrate-reset` / `migrate-dev` tools.
- **`prisma migrate dev` does not work** (the Supabase pooler exposes no shadow database). Migrations are hand-authored SQL per IMPLEMENTATION.md section 7: edit `prisma/schema.prisma`, run `bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` to see the SQL, hand-write `prisma/migrations/<timestamp>_<name>/migration.sql`, run `bun run db:deploy` then `bun run db:generate`, then re-run the diff and confirm it prints `-- This is an empty migration.`
- **Announce any command that touches the database before running it**, saying what it does, whether it writes, and why. Do not retry a rejected one.
- Migration directory timestamps are hand-chosen. Every new one must sort after `20260815130000`.
- **Never edit an applied migration.** Prisma stores its checksum.
- New tenant tables get an RLS policy block mirroring `activity_entries`, even though RLS is inert through Prisma.
- **RLS is inert at runtime.** Prisma connects as the database owner. Isolation is the composite foreign key binding `companyId` to the reporting year, plus `src/lib/auth/company-scope.ts`.
- **Every Server Action re-validates with its own `.strict()` Zod schema and re-authorizes** by calling the scope resolver first inside the `try`. Server Actions are public POST endpoints; a layout guard protects rendering only.
- **`updateMany` / `deleteMany` return `{ count }` instead of throwing. Check the count.**
- **Quantities and factors are Prisma `Decimal`.** They cross the RSC boundary as strings via `.toString()`, never `Number()`.
- **Every user-facing total is in tonnes (t CO2e).** Convert with `kgToTonnes`.
- **Do not read `form.formState.isSubmitting` directly.** React Compiler memoizes the React Hook Form proxy read, leaving the button enabled with no spinner. Use `useFormSubmit`.
- `es.json` and `en.json` must stay at exact key parity. Add to both.
- Test files must be `src/**/*.test.ts`. A `.test.tsx` is silently not collected. `globals: false`, so import `describe`/`it`/`expect` from `vitest`. The environment is `node`; there is no jsdom, so no component render tests.
- Before claiming any task done: `bun run typecheck && bun run lint && bun run test`.

---

## File Structure

**Workstream A, company profile fields**
- Modify `prisma/schema.prisma` (Company model)
- Create `prisma/migrations/20260903120000_company_profile_fields/migration.sql`
- Modify `src/features/company/schemas/company-schema.ts` (server input + form factory)
- Modify `src/features/company/actions/company-actions.ts` (normalization)
- Modify `src/features/company/components/company-profile-form.tsx`
- Modify `src/features/company/components/company-skeleton.tsx`
- Modify `src/features/reports/lib/load-report.ts` (two selects + `toCompanyProfile`)
- Modify `src/messages/es.json`, `src/messages/en.json`
- Test `src/features/company/schemas/__tests__/company-schema.test.ts`

**Workstream B, one price per fuel per year**
- Modify `prisma/schema.prisma` (`FuelType` enum, `EmissionFactor.fuelType`, `TransportSubsidyPrice`)
- Create `prisma/migrations/20260903120100_fuel_prices_by_type/migration.sql`
- Create `src/lib/calc/fuel.ts` (the single derivation rule, shared by importer and app)
- Modify `src/lib/calc/rollup.ts`, `src/lib/calc/preview.ts`
- Modify `src/features/dashboard/lib/dashboard-data.ts`, `src/features/preview/lib/load-preview.ts`, `src/features/reports/lib/load-report.ts`, `src/features/data-entry/components/data-entry-screen.tsx`
- Modify `src/features/admin/schemas/factor-schemas.ts`, `src/features/admin/actions/factor-actions.ts`, `src/features/admin/lib/factor-library-cache.ts`, `src/features/admin/hooks/use-subsidy-price-form.ts`, `src/features/admin/components/subsidy-price-dialog.tsx`, `src/features/admin/components/subsidy-prices-table.tsx`
- Modify `src/messages/es.json`, `src/messages/en.json`
- Test `src/lib/calc/__tests__/fuel.test.ts` (new), `src/lib/calc/__tests__/rollup.test.ts`, `src/lib/calc/__tests__/preview.test.ts`

**Workstream C, transport trip rows**
- Modify `prisma/schema.prisma` (`ActivityEntry.@@unique([id, companyId])`, new `TransportTrip`)
- Create `prisma/migrations/20260903120200_transport_trips/migration.sql`
- Create `src/features/data-entry/schemas/trip-schemas.ts`
- Create `src/features/data-entry/actions/trips.ts`
- Create `src/features/data-entry/components/transport-trips-field.tsx`
- Create `src/features/data-entry/hooks/use-transport-trips.ts`
- Modify `src/lib/calc/rollup.ts`, `src/lib/calc/preview.ts`, `src/lib/calc/format-entered-activity.ts`
- Modify `src/features/data-entry/components/source-row.tsx`, `category-section.tsx`, `scope-tabs.tsx`, `data-entry-screen.tsx`, `src/features/data-entry/lib/types.ts`, `shape-entries.ts`
- Modify `src/features/preview/lib/load-preview.ts`, `src/features/reports/lib/load-report.ts`, `src/features/dashboard/lib/dashboard-data.ts`
- Modify `src/messages/es.json`, `src/messages/en.json`
- Modify `src/lib/auth/__tests__/action-authorization.test.ts`
- Test `src/lib/calc/__tests__/rollup.test.ts`, `preview.test.ts`, `src/features/data-entry/schemas/__tests__/trip-schema.test.ts` (new)

**Workstream D, factor correction**
- Modify `prisma/import-factors.ts`
- Modify `prisma/fix-travel-factors.ts`
- Create `prisma/repoint-renamed-factors.ts`
- Create `prisma/reapply-2026-09-03-factor-correction.ts`
- Modify `src/features/dashboard/components/dashboard-screen.tsx`, `src/features/reports/lib/build-pdf.tsx`
- Modify `src/messages/es.json`, `src/messages/en.json`
- Test `src/lib/factor-import/__tests__/derive-modes.test.ts` (new)

---

## Task 1: Company profile columns

**Files:**
- Modify: `prisma/schema.prisma` (Company model, around line 94)
- Create: `prisma/migrations/20260903120000_company_profile_fields/migration.sql`

**Interfaces:**
- Produces: six nullable Company columns `nit`, `employeeCount`, `contactName`, `contactRole`, `contactPhone`, `website`. `employeeCount` is `Int?`, the other five are `String?`. Task 2 validates them, Task 3 reads them.

- [ ] **Step 1: Add the columns to the Prisma model**

In `prisma/schema.prisma`, inside `model Company`, after the `contactEmail` line:

```prisma
  // The identifying details the report header prints. All optional: the header renders only the
  // ones that are filled, and every company onboarded before 2026-09-03 has none of them.
  // `nit` is the Colombian tax id. Deliberately NOT unique: legacy rows may repeat or omit it,
  // and a plain unique index would treat two NULLs as distinct anyway (IMPLEMENTATION.md §11).
  nit           String?
  employeeCount Int? // Colaboradores
  contactName   String?
  contactRole   String?
  contactPhone  String?
  website       String?
```

- [ ] **Step 2: See the SQL Prisma would generate**

Announce first that this command reads the live database schema and writes nothing. Then run:

```bash
bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Expected: six `ALTER TABLE "companies" ADD COLUMN` statements and nothing else. If the diff also proposes dropping `emission_factors_natural_key`, `activity_entries_annual_source_key`, or any CHECK constraint, do NOT copy that: those objects live only in migration SQL and the schema does not own them.

- [ ] **Step 3: Hand-write the migration**

Create `prisma/migrations/20260903120000_company_profile_fields/migration.sql`:

```sql
-- Client feedback 2026-09-03 (D5): "please use company information as header, I mean the first
-- thing the user will visualize is their information." The report header in
-- src/features/reports/lib/build-pdf.tsx already renders NIT, colaboradores, responsable, cargo,
-- telefono and sitio web; until now toCompanyProfile hardcoded all six to null because the
-- columns did not exist.
--
-- All six are nullable with no default: every existing company has none of them, and the header
-- omits an empty field rather than printing a blank label.

ALTER TABLE "companies" ADD COLUMN "nit" TEXT;
ALTER TABLE "companies" ADD COLUMN "employeeCount" INTEGER;
ALTER TABLE "companies" ADD COLUMN "contactName" TEXT;
ALTER TABLE "companies" ADD COLUMN "contactRole" TEXT;
ALTER TABLE "companies" ADD COLUMN "contactPhone" TEXT;
ALTER TABLE "companies" ADD COLUMN "website" TEXT;
```

- [ ] **Step 4: Apply and regenerate**

Announce first: this WRITES to the shared database, adding six nullable columns to `companies`. It cannot lose data (no column is dropped, no row is rewritten). Then run:

```bash
bun run db:deploy && bun run db:generate
```

- [ ] **Step 5: Confirm no drift**

```bash
bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Expected output: `-- This is an empty migration.`

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260903120000_company_profile_fields/migration.sql
git commit -m "feat(db): company profile columns the report header already renders

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Validate and edit the profile fields

**Files:**
- Modify: `src/features/company/schemas/company-schema.ts`
- Modify: `src/features/company/actions/company-actions.ts`
- Modify: `src/features/company/components/company-profile-form.tsx`
- Modify: `src/features/company/components/company-skeleton.tsx`
- Modify: `src/messages/es.json`, `src/messages/en.json`
- Test: `src/features/company/schemas/__tests__/company-schema.test.ts`

**Interfaces:**
- Consumes: the six columns from Task 1.
- Produces: `updateCompanyProfileInput` accepting `nit`, `employeeCount`, `contactName`, `contactRole`, `contactPhone`, `website`; `companyProfileFormSchema(t)` gaining the same six string fields (`employeeCount` stays a string in the form and is coerced server side).

- [ ] **Step 1: Write the failing tests**

Read `src/features/company/schemas/__tests__/company-schema.test.ts` first and follow its existing style. Append:

```ts
it("accepts the six profile fields and normalizes empty strings to null", () => {
  const parsed = updateCompanyProfileInput.safeParse({
    companyId: "3f1a5b8c-0000-4000-8000-000000000001",
    name: "Acme",
    sector: "manufactura",
    contactEmail: "",
    nit: "  900123456-7  ",
    employeeCount: "240",
    contactName: "Ana Gomez",
    contactRole: "Gerente HSEQ",
    contactPhone: "+57 300 000 0000",
    website: "https://acme.co",
  });
  expect(parsed.success).toBe(true);
  if (!parsed.success) return;
  expect(parsed.data.nit).toBe("900123456-7");
  expect(parsed.data.employeeCount).toBe(240);
});

it("turns an empty employeeCount into null rather than NaN", () => {
  const parsed = updateCompanyProfileInput.safeParse({
    companyId: "3f1a5b8c-0000-4000-8000-000000000001",
    name: "Acme",
    sector: "",
    contactEmail: "",
    nit: "",
    employeeCount: "",
    contactName: "",
    contactRole: "",
    contactPhone: "",
    website: "",
  });
  expect(parsed.success).toBe(true);
  if (!parsed.success) return;
  expect(parsed.data.employeeCount).toBeNull();
  expect(parsed.data.nit).toBeNull();
});

it("rejects a negative or non-numeric employeeCount", () => {
  const base = {
    companyId: "3f1a5b8c-0000-4000-8000-000000000001",
    name: "Acme",
    sector: "",
    contactEmail: "",
    nit: "",
    contactName: "",
    contactRole: "",
    contactPhone: "",
    website: "",
  };
  expect(updateCompanyProfileInput.safeParse({ ...base, employeeCount: "-1" }).success).toBe(false);
  expect(updateCompanyProfileInput.safeParse({ ...base, employeeCount: "abc" }).success).toBe(false);
});

it("still refuses an unexpected key", () => {
  const parsed = updateCompanyProfileInput.safeParse({
    companyId: "3f1a5b8c-0000-4000-8000-000000000001",
    name: "Acme",
    sector: "",
    contactEmail: "",
    nit: "",
    employeeCount: "",
    contactName: "",
    contactRole: "",
    contactPhone: "",
    website: "",
    active: false,
  });
  expect(parsed.success).toBe(false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
bun run test -- company-schema
```

Expected: FAIL, unrecognized keys.

- [ ] **Step 3: Extend the schemas**

In `src/features/company/schemas/company-schema.ts`, add a shared helper and the six fields. Keep `.strict()`.

```ts
// An optional free-text profile field. "" is what an untouched input posts and means "not
// provided", which is null in the database, not an empty string: build-pdf.tsx tests these with
// plain truthiness, so a stored "" would render nothing while leaving a dirty row behind.
const optionalProfileText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value): string | null => (value === "" ? null : value));

// The form posts a string. "" is null; anything else must be a whole, non-negative count.
const optionalEmployeeCount = z
  .string()
  .trim()
  .transform((value): string | null => (value === "" ? null : value))
  .refine((value) => value === null || /^\d{1,9}$/.test(value), { message: "employeeCountInvalid" })
  .transform((value): number | null => (value === null ? null : Number(value)));
```

Add to `updateCompanyProfileInput`, before the closing `.strict()`:

```ts
    nit: optionalProfileText(50),
    employeeCount: optionalEmployeeCount,
    contactName: optionalProfileText(120),
    contactRole: optionalProfileText(120),
    contactPhone: optionalProfileText(40),
    website: optionalProfileText(200),
```

Add to the client-side `companyProfileFormSchema(t)` factory, matching how the existing fields are declared there:

```ts
    nit: z.string().trim().max(50),
    employeeCount: z
      .string()
      .trim()
      .refine((value) => value === "" || /^\d{1,9}$/.test(value), t("employeeCountInvalid")),
    contactName: z.string().trim().max(120),
    contactRole: z.string().trim().max(120),
    contactPhone: z.string().trim().max(40),
    website: z.string().trim().max(200),
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
bun run test -- company-schema
```

Expected: PASS.

- [ ] **Step 5: Write the fields through the action**

In `src/features/company/actions/company-actions.ts`, the schema already returns `null` for empty values, so the manual `x && x.length > 0 ? x : null` ternaries are no longer needed for the new fields. Add all six to the `data` object of `prisma.company.updateMany`, keeping the existing `count !== 1` check untouched:

```ts
        nit: parsed.data.nit,
        employeeCount: parsed.data.employeeCount,
        contactName: parsed.data.contactName,
        contactRole: parsed.data.contactRole,
        contactPhone: parsed.data.contactPhone,
        website: parsed.data.website,
```

Do not change `resolveCompanyScope` to `resolveAdminScope`: the admin drill-down depends on the company resolver.

- [ ] **Step 6: Add the fields to the form and the skeleton**

In `src/features/company/components/company-profile-form.tsx`, add six inputs following the exact shape of the existing `contactEmail` field (same `FormField` / `FormItem` / `FormLabel` / `FormControl` structure, same grid classes). Default values come from the loaded company; a null column becomes `""`. Order: NIT, Colaboradores, Responsable, Cargo, Teléfono, Sitio web.

In `src/features/company/components/company-skeleton.tsx`, the hardcoded three field skeletons become nine, or the page jumps on load.

- [ ] **Step 7: Add the copy to both catalogs**

Under `company` in `src/messages/es.json`:

```json
"nit": "NIT",
"employeeCount": "Colaboradores",
"contactName": "Responsable",
"contactRole": "Cargo",
"contactPhone": "Teléfono",
"website": "Sitio web",
```

and under the company validation block: `"employeeCountInvalid": "Escribe un número entero de colaboradores."`

Mirror all seven keys in `src/messages/en.json`: `"NIT"`, `"Employees"`, `"Contact person"`, `"Role"`, `"Phone"`, `"Website"`, `"Enter a whole number of employees."`

- [ ] **Step 8: Verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add src/features/company src/messages/es.json src/messages/en.json
git commit -m "feat(company): edit NIT, colaboradores and contact details on the profile

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Feed the profile fields into the report header

**Files:**
- Modify: `src/features/reports/lib/load-report.ts:13-24` (`toCompanyProfile`), and the two `prisma.company` selects at roughly `:288` and `:359`

**Interfaces:**
- Consumes: the six Company columns.
- Produces: a populated `CompanyProfile`. `build-pdf.tsx` needs no change; its rendering branches already exist.

- [ ] **Step 1: Widen both company selects**

Both `loadSingleFacilityReport` and `loadCompanyWideReport` currently select `{ name: true, sector: true, contactEmail: true }`. Add the six new columns to each.

- [ ] **Step 2: Stop hardcoding nulls**

Replace `toCompanyProfile` with:

```ts
function toCompanyProfile(company: {
  sector: string | null;
  contactEmail: string | null;
  nit: string | null;
  employeeCount: number | null;
  contactName: string | null;
  contactRole: string | null;
  contactPhone: string | null;
  website: string | null;
}): CompanyProfile {
  return {
    sector: company.sector,
    contactEmail: company.contactEmail,
    nit: company.nit,
    employeeCount: company.employeeCount,
    contactName: company.contactName,
    contactRole: company.contactRole,
    contactPhone: company.contactPhone,
    website: company.website,
  };
}
```

`employeeCount` is an `Int`, not a `Decimal`, so it crosses the boundary as a number. `build-pdf.tsx:722` checks `!== null`, so a genuine 0 renders, which is correct.

- [ ] **Step 3: Verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add src/features/reports/lib/load-report.ts
git commit -m "feat(reports): print the company profile fields the header was already built for

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Schema for one price per fuel per year

**Files:**
- Modify: `prisma/schema.prisma` (new `FuelType` enum, `EmissionFactor.fuelType`, `TransportSubsidyPrice`)
- Create: `prisma/migrations/20260903120100_fuel_prices_by_type/migration.sql`

**Interfaces:**
- Produces: `enum FuelType { GASOLINE, DIESEL }`; `EmissionFactor.fuelType FuelType?`; `TransportSubsidyPrice.fuel FuelType` with `@@unique([year, fuel])` replacing `year @unique`, and `pricePerGallonCop` widened to `Decimal(20, 6)`.

**Background, verified from the client's own files.** The official `Emission Factors` sheet has exactly two `Subsidios de transporte` elements, both with unit `gal`: `C6: Gasolina E10 (Comercial) - Móvil` and `C6: Diésel B10 (Mezcla comercial) - Móvil`. Migration `20260815120000` set BOTH to `MONEY_PER_GALLON`, and both currently divide by the same single yearly price, so diesel is priced at the gasoline price. The client's `C6 - Viajes de negocios.xlsx`, sheet `(C6) Viajes y subsidios`, columns N/O/P, carries the national averages they want used: 2024 gasoline 16046.315789473685 and diesel 9574.1578947368416; 2025 gasoline 15663.157894736842 and diesel 10646.473684210527. The 12 decimal places are why `Decimal(20,2)` has to go.

- [ ] **Step 1: Edit the schema**

Add the enum next to `EntryMode`:

```prisma
// Which fuel a MONEY_PER_GALLON factor buys, so the engine divides the reported money by the
// right yearly average price. Client feedback 2026-09-03: "gas and diesel prices table, but
// again I need to be able to add them from admin user". Null for every factor that is not a
// transport subsidy.
enum FuelType {
  GASOLINE // C6: Gasolina E10 (Comercial) - Móvil
  DIESEL // C6: Diésel B10 (Mezcla comercial) - Móvil
}
```

On `EmissionFactor`, directly under `entryMode`:

```prisma
  // Only meaningful when entryMode = MONEY_PER_GALLON. Derived from the workbook by
  // src/lib/calc/fuel.ts, never typed by hand.
  fuelType       FuelType?
```

Replace the `TransportSubsidyPrice` model body with:

```prisma
model TransportSubsidyPrice {
  id String @id @default(uuid())
  year Int
  // One row per fuel per year. Before 2026-09-03 there was a single price per year and diesel
  // was silently charged the gasoline price; the migration backfills every existing row as
  // GASOLINE, which is what it always was.
  fuel FuelType
  // Decimal(20,6), not (20,2): the client's own averages carry twelve decimal places
  // (16046.315789473685 for 2024 gasoline). Six is far past materiality for a COP price and
  // matches the activity-value scale used everywhere else.
  pricePerGallonCop Decimal @db.Decimal(20, 6) // COP / gal
  source String?
  createdAt DateTime @default(now())
  updatedAt DateTime @default(now()) @updatedAt
  updatedByEmail String?

  @@unique([year, fuel])
  @@map("transport_subsidy_prices")
}
```

- [ ] **Step 2: See the SQL Prisma would generate**

Announce that this reads the live schema and writes nothing, then run the `migrate diff` command from the Global Constraints.

- [ ] **Step 3: Hand-write the migration**

Create `prisma/migrations/20260903120100_fuel_prices_by_type/migration.sql`:

```sql
-- Client feedback 2026-09-03 (E4): "gas and diesel prices table, but again I need to be able to
-- add them from admin user."
--
-- Until now transport_subsidy_prices held ONE price per year and both C6 subsidy factors
-- (gasoline and diesel) divided by it, so diesel was priced at the gasoline price. This splits
-- the table by fuel, adds a typed fuel column on the factor so the engine knows which price to
-- use, and widens the money column: the client's own averages carry twelve decimal places and
-- DECIMAL(20,2) rejected them.

CREATE TYPE "FuelType" AS ENUM ('GASOLINE', 'DIESEL');

ALTER TABLE "emission_factors" ADD COLUMN "fuelType" "FuelType";

-- Existing rows were always the gasoline price; name that explicitly before the column is NOT
-- NULL, so no row is invented and none is lost.
ALTER TABLE "transport_subsidy_prices" ADD COLUMN "fuel" "FuelType";
UPDATE "transport_subsidy_prices" SET "fuel" = 'GASOLINE' WHERE "fuel" IS NULL;
ALTER TABLE "transport_subsidy_prices" ALTER COLUMN "fuel" SET NOT NULL;

ALTER TABLE "transport_subsidy_prices"
  ALTER COLUMN "pricePerGallonCop" TYPE DECIMAL(20,6);

DROP INDEX "transport_subsidy_prices_year_key";
CREATE UNIQUE INDEX "transport_subsidy_prices_year_fuel_key"
  ON "transport_subsidy_prices"("year", "fuel");

-- Backfill the two subsidy factors. Matching on subcategory plus a substring of the element is a
-- ONE-TIME data correction, exactly as the entryMode backfill in 20260815120000 was; fuelType is
-- what the app branches on from here, and src/lib/calc/fuel.ts is what keeps it correct on a
-- re-import. Accent-insensitive on "Diesel" because the workbook writes "Diésel".
UPDATE "emission_factors" SET "fuelType" = 'GASOLINE'
  WHERE "entryMode" = 'MONEY_PER_GALLON' AND "element" ILIKE '%gasolina%';

UPDATE "emission_factors" SET "fuelType" = 'DIESEL'
  WHERE "entryMode" = 'MONEY_PER_GALLON'
    AND ("element" ILIKE '%diésel%' OR "element" ILIKE '%diesel%');

-- The national average prices CECODES supplied in "C6 - Viajes de negocios.xlsx", sheet
-- "(C6) Viajes y subsidios", columns N/O/P. Inserted only where the admin has not already
-- entered that year and fuel, so a later hand correction is never overwritten by a re-deploy.
INSERT INTO "transport_subsidy_prices" ("id", "year", "fuel", "pricePerGallonCop", "source", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 2024, 'GASOLINE', 16046.315789, 'CECODES, C6 - Viajes de negocios.xlsx (promedio nacional)', NOW(), NOW()),
  (gen_random_uuid()::text, 2024, 'DIESEL',    9574.157895, 'CECODES, C6 - Viajes de negocios.xlsx (promedio nacional)', NOW(), NOW()),
  (gen_random_uuid()::text, 2025, 'GASOLINE', 15663.157895, 'CECODES, C6 - Viajes de negocios.xlsx (promedio nacional)', NOW(), NOW()),
  (gen_random_uuid()::text, 2025, 'DIESEL',   10646.473684, 'CECODES, C6 - Viajes de negocios.xlsx (promedio nacional)', NOW(), NOW())
ON CONFLICT ("year", "fuel") DO NOTHING;
```

- [ ] **Step 4: Apply, regenerate, confirm no drift**

Announce first: this WRITES. It adds a nullable column to `emission_factors`, adds a NOT NULL `fuel` column to `transport_subsidy_prices` (backfilled as GASOLINE, which is what those rows always were), widens a numeric column, replaces one unique index with another, and inserts up to four price rows the client supplied. No row is deleted.

```bash
bun run db:deploy && bun run db:generate
bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Expected on the last command: `-- This is an empty migration.`

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260903120100_fuel_prices_by_type/migration.sql
git commit -m "feat(db): one transport subsidy price per fuel per year

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: The fuel derivation rule, and the engine using it

**Files:**
- Create: `src/lib/calc/fuel.ts`
- Create: `src/lib/calc/__tests__/fuel.test.ts`
- Modify: `src/lib/calc/rollup.ts` (`RollupFactor`, the `MONEY_PER_GALLON` branch around `:327-335`, and the rollup input that carries the price)
- Modify: `src/lib/calc/preview.ts` (`PreviewFactor`, `PreviewSubsidyPrice`, the `MONEY_PER_GALLON` branch around `:153-159`)
- Test: `src/lib/calc/__tests__/rollup.test.ts`, `src/lib/calc/__tests__/preview.test.ts`

**Interfaces:**
- Produces:
  - `export type FuelType = "GASOLINE" | "DIESEL";`
  - `export function deriveFuelType(row: { entryMode: string; element: string }): FuelType | null`
  - `export type FuelPrices = { GASOLINE: string | null; DIESEL: string | null };`
  - `export function priceForFuel(prices: FuelPrices | null, fuel: FuelType | null): string | null`
- Consumed by Tasks 6, 7 and 13.

- [ ] **Step 1: Write the failing test**

Create `src/lib/calc/__tests__/fuel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveFuelType, priceForFuel } from "../fuel";

describe("deriveFuelType", () => {
  it("names the two C6 subsidy elements from the client's workbook", () => {
    expect(
      deriveFuelType({
        entryMode: "MONEY_PER_GALLON",
        element: "C6: Gasolina E10 (Comercial) - Móvil",
      }),
    ).toBe("GASOLINE");
    expect(
      deriveFuelType({
        entryMode: "MONEY_PER_GALLON",
        element: "C6: Diésel B10 (Mezcla comercial) - Móvil",
      }),
    ).toBe("DIESEL");
  });

  it("matches an unaccented Diesel, because a workbook revision may drop the accent", () => {
    expect(
      deriveFuelType({ entryMode: "MONEY_PER_GALLON", element: "C6: Diesel B10 - Movil" }),
    ).toBe("DIESEL");
  });

  it("returns null for a factor that is not a money-per-gallon subsidy", () => {
    expect(deriveFuelType({ entryMode: "QUANTITY", element: "C6: Gasolina E10" })).toBeNull();
    expect(
      deriveFuelType({ entryMode: "MONEY_PER_GALLON", element: "C6: Gas natural vehicular" }),
    ).toBeNull();
  });
});

describe("priceForFuel", () => {
  const prices = { GASOLINE: "16046.315789", DIESEL: "9574.157895" };

  it("picks the price of the fuel the factor names", () => {
    expect(priceForFuel(prices, "DIESEL")).toBe("9574.157895");
    expect(priceForFuel(prices, "GASOLINE")).toBe("16046.315789");
  });

  it("returns null rather than guessing when the fuel is unknown", () => {
    expect(priceForFuel(prices, null)).toBeNull();
  });

  it("returns null when the year has no prices at all", () => {
    expect(priceForFuel(null, "DIESEL")).toBeNull();
  });

  it("returns null when only the other fuel has a price", () => {
    expect(priceForFuel({ GASOLINE: "16046", DIESEL: null }, "DIESEL")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bun run test -- fuel
```

Expected: FAIL, cannot resolve `../fuel`.

- [ ] **Step 3: Write the module**

Create `src/lib/calc/fuel.ts`:

```ts
// Which fuel a Scope 3 C6 "Subsidios de transporte" factor buys.
//
// The company reports money (COP); the engine divides it by that year's average price per gallon
// to get gallons, then prices the gallons. Until 2026-09-03 there was one price per year and both
// the gasoline and the diesel factor divided by it, so diesel was charged the gasoline price.
//
// The rule lives here, in one place, because it has two callers that must never disagree: the
// importer (which stamps EmissionFactor.fuelType on every run, so a renamed row does not lose it)
// and the app (which reads that column). Matching on the element name is acceptable ONLY as the
// derivation that fills the typed column; nothing downstream matches on names.

export type FuelType = "GASOLINE" | "DIESEL";

export type FuelPrices = { GASOLINE: string | null; DIESEL: string | null };

// Accent-insensitive: the workbook writes "Diésel", a future revision may not.
const DIESEL = /di[eé]sel/i;
const GASOLINE = /gasolina/i;

export function deriveFuelType(row: { entryMode: string; element: string }): FuelType | null {
  if (row.entryMode !== "MONEY_PER_GALLON") return null;
  if (DIESEL.test(row.element)) return "DIESEL";
  if (GASOLINE.test(row.element)) return "GASOLINE";
  // A money-per-gallon factor for some other fuel: leave it unidentified rather than defaulting
  // to gasoline, so the engine reports a missing price instead of pricing it wrongly.
  return null;
}

export function priceForFuel(prices: FuelPrices | null, fuel: FuelType | null): string | null {
  if (!prices || fuel === null) return null;
  return prices[fuel];
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
bun run test -- fuel
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Write the failing engine tests**

Append to `src/lib/calc/__tests__/rollup.test.ts`, following the shape of the existing `MONEY_PER_GALLON` tests near `:544`:

```ts
it("divides a diesel subsidy by the diesel price, not the gasoline price", () => {
  // 1.000.000 COP of diesel at 9.574,157895 COP/gal is 104,4477 gal, not 62,3196.
  const r = rollupYear({
    year: 2024,
    gwpSet: "AR6",
    gridFactor: null,
    fuelPrices: { GASOLINE: "16046.315789", DIESEL: "9574.157895" },
    entries: [
      moneyEntry({
        element: "C6: Diésel B10 (Mezcla comercial) - Móvil",
        fuelType: "DIESEL",
        value: "1000000",
        co2Factor: "10.2765",
      }),
    ],
  });
  expect(r.byScope.SCOPE_3 * 1000).toBeCloseTo((1000000 / 9574.157895) * 10.2765, 4);
  expect(r.missingTransportSubsidyPrice).toBe(false);
});

it("reports a missing price when only the other fuel has one", () => {
  const r = rollupYear({
    year: 2024,
    gwpSet: "AR6",
    gridFactor: null,
    fuelPrices: { GASOLINE: "16046.315789", DIESEL: null },
    entries: [
      moneyEntry({
        element: "C6: Diésel B10 (Mezcla comercial) - Móvil",
        fuelType: "DIESEL",
        value: "1000000",
        co2Factor: "10.2765",
      }),
    ],
  });
  expect(r.missingTransportSubsidyPrice).toBe(true);
  expect(r.byScope.SCOPE_3).toBe(0);
});

it("treats a price of zero as missing rather than dividing by it", () => {
  const r = rollupYear({
    year: 2024,
    gwpSet: "AR6",
    gridFactor: null,
    fuelPrices: { GASOLINE: "0", DIESEL: null },
    entries: [
      moneyEntry({
        element: "C6: Gasolina E10 (Comercial) - Móvil",
        fuelType: "GASOLINE",
        value: "1000000",
        co2Factor: "7.6181",
      }),
    ],
  });
  expect(r.missingTransportSubsidyPrice).toBe(true);
  expect(Number.isFinite(r.byScope.SCOPE_3)).toBe(true);
  expect(r.byScope.SCOPE_3).toBe(0);
});
```

Write the `moneyEntry` helper alongside the file's existing helpers if one does not already exist, building a `RollupSourceRow` with `entryMode: "MONEY_PER_GALLON"` and the given `fuelType`.

- [ ] **Step 6: Run to verify they fail**

```bash
bun run test -- rollup
```

Expected: FAIL, `fuelPrices` is not a known input.

- [ ] **Step 7: Change the engine**

In `src/lib/calc/rollup.ts`:

- Add `fuelType: FuelType | null` to the factor shape carried on `RollupSourceRow` (the type declaring `entryMode` around `:26-33`).
- Replace the rollup input's single `pricePerGallon: string | null` with `fuelPrices: FuelPrices | null`.
- Rewrite the `MONEY_PER_GALLON` branch (around `:327-335`):

```ts
    if (entryMode === "MONEY_PER_GALLON") {
      const price = priceForFuel(fuelPrices, entry.factor?.fuelType ?? null);
      const priceNumber = price === null ? null : Number(price);
      // A missing price is load-bearing state, not an error: the entry is excluded and disclosed
      // rather than priced at a guess. Zero is treated the same way, because dividing by it would
      // produce Infinity and poison the total silently.
      if (priceNumber === null || !Number.isFinite(priceNumber) || priceNumber === 0) {
        missingTransportSubsidyPrice = true;
        continue;
      }
      activity = parseActivity(entry.value) / priceNumber;
    } else if (...)
```

Import `priceForFuel`, `type FuelPrices` and `type FuelType` from `./fuel`.

In `src/lib/calc/preview.ts`:

- Add `fuelType?: FuelType | null` to `PreviewFactor`.
- Replace `PreviewSubsidyPrice` with `export type PreviewSubsidyPrice = { prices: FuelPrices; source: string | null };`
- Rewrite the `MONEY_PER_GALLON` branch (around `:153-159`) with the same null-and-zero guard, returning `{ kind: "missingTransportSubsidyPrice" }` in both cases.

- [ ] **Step 8: Run to verify they pass**

```bash
bun run test -- rollup preview fuel
```

Expected: PASS. Fix every call site the typechecker flags in the next task.

- [ ] **Step 9: Commit**

```bash
bun run typecheck || true   # loaders are updated in Task 6; engine tests must pass here
git add src/lib/calc/fuel.ts src/lib/calc/__tests__/fuel.test.ts src/lib/calc/rollup.ts src/lib/calc/preview.ts src/lib/calc/__tests__/rollup.test.ts src/lib/calc/__tests__/preview.test.ts
git commit -m "feat(calc): price a transport subsidy by its own fuel

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Load both fuel prices everywhere the engine is fed

**Files:**
- Modify: `src/features/dashboard/lib/dashboard-data.ts` (around `:132` and `:416`)
- Modify: `src/features/preview/lib/load-preview.ts` (around `:126` and `:447`)
- Modify: `src/features/reports/lib/load-report.ts` (around `:319` and `:394`)
- Modify: `src/features/data-entry/components/data-entry-screen.tsx` (around `:149` and `:212`)
- Modify: `src/features/data-entry/components/category-section.tsx`, `estimate-popover.tsx`, `scope-tabs.tsx`, `source-row.tsx`, `hooks/use-source-estimate.ts` (the `PreviewSubsidyPrice` prop type flows through these unchanged in shape)
- Test: `src/features/dashboard/lib/__tests__/dashboard-data.test.ts`, `src/features/preview/lib/__tests__/load-preview.test.ts`

**Interfaces:**
- Consumes: `FuelPrices`, `priceForFuel` from Task 5.
- Produces: every loader passing `fuelPrices: FuelPrices | null` to `rollupYear`, and `PreviewSubsidyPrice` carrying both prices.

- [ ] **Step 1: Replace every single-price query**

Each site currently does `findUnique({ where: { year } })` or `findMany({ where: { year: { in: years } } })` and builds a price map. Replace with a query that keeps the fuel, and a small shared helper. Add to `src/lib/calc/fuel.ts`:

```ts
/** Folds the year's rows into the two-slot shape the engine takes. Absent fuel stays null. */
export function toFuelPrices(
  rows: { fuel: FuelType; pricePerGallonCop: { toString(): string } }[],
): FuelPrices {
  const prices: FuelPrices = { GASOLINE: null, DIESEL: null };
  for (const row of rows) prices[row.fuel] = row.pricePerGallonCop.toString();
  return prices;
}
```

Add a test for it in `fuel.test.ts` asserting that an empty array gives `{ GASOLINE: null, DIESEL: null }` and that two rows fill both slots as strings.

At each of the six loader sites, change `findUnique` to `findMany({ where: { year }, select: { fuel: true, pricePerGallonCop: true, source: true } })` and pass `toFuelPrices(rows)`. For the multi-year sites in `dashboard-data.ts`, key the map by year and build one `FuelPrices` per year.

Every `pricePerGallonCop` must reach the engine via `.toString()`, never `Number()`.

- [ ] **Step 2: Select fuelType on every factor read that feeds the engine**

`gasType: true` is already selected in these queries. Add `fuelType: true` beside it in `load-report.ts` (`ENTRY_SELECT` and the `EntryRow` factor type), `load-preview.ts` (both select sites), `dashboard-data.ts`, and `data-entry-screen.tsx`.

- [ ] **Step 3: Update the mocked tests**

`dashboard-data.test.ts:127` and `load-preview.test.ts:114` mock `findUnique` on `transportSubsidyPrice`. Change the mocks to `findMany` returning `[]` by default, and update `setupEntryMode` in `load-preview.test.ts:235-244` to return rows carrying a `fuel`.

Add one test to `load-preview.test.ts` proving the diesel path: a diesel subsidy entry with both prices present must divide by the diesel price.

- [ ] **Step 4: Verify**

```bash
bun run typecheck && bun run lint && bun run test
```

Expected: all green. The typechecker is the checklist here; every remaining error is a call site not yet converted.

- [ ] **Step 5: Commit**

```bash
git add src/features src/lib/calc/fuel.ts src/lib/calc/__tests__/fuel.test.ts
git commit -m "feat(calc): load gasoline and diesel prices at every engine entry point

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Admin edits both fuel prices

**Files:**
- Modify: `src/features/admin/schemas/factor-schemas.ts` (`upsertSubsidyPriceInput:120-130`, `deleteSubsidyPriceInput:132`, `subsidyPriceFormSchema:233`)
- Modify: `src/features/admin/actions/factor-actions.ts` (`upsertSubsidyPrice:290`, `deleteSubsidyPrice:321`)
- Modify: `src/features/admin/lib/factor-library-cache.ts` (`CachedSubsidyPrice:73`, `getSubsidyPrices:229`)
- Modify: `src/features/admin/hooks/use-subsidy-price-form.ts`
- Modify: `src/features/admin/components/subsidy-price-dialog.tsx`, `subsidy-prices-table.tsx`
- Modify: `src/messages/es.json`, `src/messages/en.json`
- Modify: `src/lib/auth/__tests__/action-authorization.test.ts`

**Interfaces:**
- Consumes: the `fuel` column from Task 4.
- Produces: `upsertSubsidyPrice({ year, fuel, pricePerGallonCop, source, mode })` and `deleteSubsidyPrice({ year, fuel })`.

The whole subsidy admin surface already exists at `/admin/factors?tab=subsidy`. This task extends it; do not rebuild it.

- [ ] **Step 1: Widen the decimal guard and add the fuel field**

In `factor-schemas.ts`, the price refinement is `/^\d{1,18}(\.\d{1,2})?$/` in TWO places (`:126` and inside `subsidyPriceFormSchema` at roughly `:243`). The column is now `DECIMAL(20,6)`, so both become:

```ts
      .refine((value) => /^\d{1,14}(\.\d{1,6})?$/.test(value), { message: "decimalInvalid" }),
```

Add `fuel: z.enum(["GASOLINE", "DIESEL"])` to `upsertSubsidyPriceInput` and to `deleteSubsidyPriceInput`, and `fuel: z.enum(["GASOLINE", "DIESEL"])` to `subsidyPriceFormSchema`. Keep `.strict()`.

- [ ] **Step 2: Key both actions by year and fuel**

In `factor-actions.ts`, `upsertSubsidyPrice` keeps its `mode === "create"` pre-check but now looks up the composite key, and the upsert uses it:

```ts
    if (mode === "create") {
      const existing = await prisma.transportSubsidyPrice.findUnique({
        where: { year_fuel: { year, fuel } },
        select: { year: true },
      });
      if (existing) return { error: "subsidyYearExists" };
    }

    await prisma.transportSubsidyPrice.upsert({
      where: { year_fuel: { year, fuel } },
      create: { year, fuel, pricePerGallonCop, source, updatedByEmail: scope.appUser.email },
      update: { pricePerGallonCop, source, updatedByEmail: scope.appUser.email },
    });
```

`deleteSubsidyPrice` deletes by `{ year, fuel }` and keeps its `if (result.count !== 1) throw new ScopeError("not-found")` check.

Both keep `resolveAdminScope()` as the first call inside the `try`, and both keep the existing three-part invalidation: `revalidatePath("/admin/factors")`, `revalidatePath("/data-entry")`, `updateTag(SUBSIDY_PRICES_TAG)`. Omitting the tag leaves the cached read stale forever.

- [ ] **Step 3: Carry the fuel through the cache and the UI**

`CachedSubsidyPrice` gains `fuel: "GASOLINE" | "DIESEL"`. `getSubsidyPrices` orders by `[{ year: "desc" }, { fuel: "asc" }]` and selects the new column, still stringifying the Decimal.

`SubsidyPriceRow` gains `fuel`. The table gains a Fuel column between Year and Price, and its `key` becomes `` `${row.year}-${row.fuel}` `` (year alone is no longer unique). The delete confirmation names the fuel as well as the year. The dialog gains a `Select` with the two options, disabled when editing (fuel is half the key; changing it is a create, not an edit).

- [ ] **Step 4: Copy in both catalogs**

Under `admin.factors.subsidy` in `es.json`: `"fuel": "Combustible"`, `"fuelGasoline": "Gasolina"`, `"fuelDiesel": "Diésel"`. Under `admin.factors.errors`: `"subsidyYearExists": "Ya existe un precio para ese año y combustible."` Mirror in `en.json`. Confirm parity by comparing the key sets of both files under `admin`.

- [ ] **Step 5: Keep the authorization test honest**

`src/lib/auth/__tests__/action-authorization.test.ts:315-321` calls `upsertSubsidyPrice` and `deleteSubsidyPrice`. Update both call sites to pass `fuel`, and confirm the test still asserts that a non-admin is refused.

- [ ] **Step 6: Verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add src/features/admin src/messages/es.json src/messages/en.json src/lib/auth/__tests__/action-authorization.test.ts
git commit -m "feat(admin): maintain a gasoline and a diesel price for each year

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Schema for transport trip rows

**Files:**
- Modify: `prisma/schema.prisma` (`ActivityEntry`, new `TransportTrip`)
- Create: `prisma/migrations/20260903120200_transport_trips/migration.sql`

**Interfaces:**
- Produces: `TransportTrip { id, activityEntryId, companyId, position, reference, count, distanceKm, note }` with a composite foreign key binding `companyId` to the entry, and `ActivityEntry.@@unique([id, companyId])` to back it.

**Background, verified from the client's four reference workbooks.** Each template is one row per route with two multiplied quantities. C4 and C9 are load times distance (`ton * km`) or vehicles times distance (`vehículo * km`), plus "Nombre de referencia" and "Observaciones" columns. C7 is vehicles or passengers times distance. C6 is passengers times distance for air and distance for land. The official factor library has exactly 25 such factors: `pasajeros * km` 6, `ton * km` 8, `vehículo * km` 11. The `20260815120000` backfill covered only the first and third, so **the eight `ton * km` factors are still QUANTITY** and force the user to pre-multiply by hand. `km tubería` (4 factors) is a plain quantity and must NOT be swept in.

- [ ] **Step 1: Edit the schema**

Add to `model ActivityEntry`, beside the existing `@@unique`:

```prisma
  // Backs the composite foreign key from transport_trips, exactly as ReportingYear's
  // @@unique([id, companyId]) backs the one from activity_entries.
  @@unique([id, companyId])
```

and a relation field:

```prisma
  trips TransportTrip[]
```

Add the model:

```prisma
// One route of a transport source: a count and a distance, multiplied. Client feedback
// 2026-09-03 (E3): C4, C6, C7 and C9 need "a way to register pasajero*km and vehículo*km", and
// the four templates CECODES sent are one row per route.
//
// A child table rather than more ActivityEntry rows: activity_entries is uniquely keyed by
// (reportingYearId, emissionFactorId, month) plus a partial unique index for the annual rows, so
// N sibling rows per source are physically impossible there.
//
// The composite FK binds companyId to the entry, so a spoofed companyId matches nothing. That,
// plus the company-scope guard, is the isolation: RLS is inert through Prisma.
model TransportTrip {
  id String @id @default(uuid())

  entry           ActivityEntry @relation(fields: [activityEntryId, companyId], references: [id, companyId], onDelete: Cascade)
  activityEntryId String
  companyId       String // denormalized for RLS

  // Display order, 0-based. The save action rewrites the whole set, so positions are always dense.
  position Int
  // "Nombre de referencia - Fuente de emisión" in the client's templates: the route or trip name.
  reference String?
  // Passengers, vehicles or tonnes, per the first half of the factor's unit.
  count Decimal @db.Decimal(20, 6)
  // Distance in km, the second half of the unit.
  distanceKm Decimal @db.Decimal(20, 6)
  // "Observaciones".
  note String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([activityEntryId, position])
  @@index([activityEntryId])
  @@index([companyId])
  @@map("transport_trips")
}
```

- [ ] **Step 2: See the SQL, then hand-write the migration**

Run the `migrate diff` command (read-only; announce it). Then create `prisma/migrations/20260903120200_transport_trips/migration.sql`:

```sql
-- Client feedback 2026-09-03 (E3): "C4, C6, C7 and C9 need a way to register pasajero*km and
-- vehículo*km. Use a template for this."
--
-- One row per route under an activity entry, so the tool multiplies each route and adds them
-- instead of asking the user to pre-multiply. The four reference workbooks CECODES sent are
-- exactly this shape.

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

-- Composite FK: companyId is bound to the entry, so a child row cannot claim one company while
-- its entry belongs to another. Same shape as activity_entries -> reporting_years.
ALTER TABLE "transport_trips" ADD CONSTRAINT "transport_trips_activityEntryId_companyId_fkey"
  FOREIGN KEY ("activityEntryId", "companyId") REFERENCES "activity_entries"("id", "companyId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- A count or a distance may be zero (a reported zero is an answer), but never negative.
-- Written to be explicitly true or false: a CHECK that evaluates to NULL PASSES, and both
-- columns are NOT NULL so this is safe as written.
ALTER TABLE "transport_trips" ADD CONSTRAINT "transport_trips_non_negative"
  CHECK ("count" >= 0 AND "distanceKm" >= 0);

-- RLS: inert through Prisma (which connects as the table owner) but present for any future
-- non-Prisma access path, mirroring activity_entries exactly.
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
-- The 20260815120000 backfill covered only 'pasajeros * km' and 'vehículo * km', so C4/C9 freight
-- has been forcing users to pre-multiply. Verified against the official Emission Factors sheet:
-- the only "* km" units are pasajeros (6), ton (8) and vehículo (11). "km tubería" is a plain
-- quantity and is deliberately not matched.
UPDATE "emission_factors" SET "entryMode" = 'COUNT_TIMES_DISTANCE'
  WHERE "unit" = 'ton * km' AND "entryMode" = 'QUANTITY';

-- Move every value already entered against a COUNT_TIMES_DISTANCE source into its first trip, so
-- nothing that was reported is lost and the new screen opens on the user's own data. Entries with
-- no value reported stay empty. secondaryValue defaulted to 1 for rows backfilled by
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
```

- [ ] **Step 3: Apply, regenerate, confirm no drift**

Announce first: this WRITES. It creates one table and its indexes, adds a unique index to `activity_entries` (no data change), flips eight emission factors from QUANTITY to COUNT_TIMES_DISTANCE, and copies existing reported values into one trip row each. Nothing is deleted.

```bash
bun run db:deploy && bun run db:generate
bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Expected on the last command: `-- This is an empty migration.`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260903120200_transport_trips/migration.sql
git commit -m "feat(db): transport trip rows, and ton*km joins the count-times-distance mode

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: The engine sums the products

**Files:**
- Modify: `src/lib/calc/rollup.ts` (`RollupSourceRow`, the `COUNT_TIMES_DISTANCE` branch at `:336-339`)
- Modify: `src/lib/calc/preview.ts` (the `COUNT_TIMES_DISTANCE` branch at `:160-164`)
- Modify: `src/lib/calc/format-entered-activity.ts` (around `:57`)
- Test: `src/lib/calc/__tests__/rollup.test.ts`, `src/lib/calc/__tests__/preview.test.ts`

**Interfaces:**
- Consumes: `TransportTrip` rows.
- Produces: `RollupSourceRow.trips?: { count: string; distanceKm: string }[]`; `estimateSource`'s `trips?: { count: string; distanceKm: string }[]`.

**The trap.** `preview.ts:160-164` computes `sum(count) * sum(distance)`; `rollup.ts:336-339` multiplies per entry. With one cell per source they agree, so **fixing this changes no current output and no existing test will fail.** Write the multi-row test first or the change is unverifiable.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/calc/__tests__/preview.test.ts`:

```ts
it("adds the product of each trip, not the product of the sums", () => {
  // Two trips: 4 x 250 and 6 x 100 is 1.600 pasajeros*km, NOT (4+6) x (250+100) = 3.500.
  const result = estimateSource({
    factor: countTimesDistanceFactor({ co2Factor: "0.1" }),
    values: ["4", "6"],
    secondaryValues: ["250", "100"],
    gridFactor: null,
    pricePerGallon: null,
  });
  expect(result.kind).toBe("ok");
  if (result.kind !== "ok") return;
  expect(result.tonnes).toBeCloseTo((4 * 250 + 6 * 100) * 0.1 * 0.001, 10);
});

it("pairs a missing secondary value as empty rather than reading past the end", () => {
  const result = estimateSource({
    factor: countTimesDistanceFactor({ co2Factor: "0.1" }),
    values: ["4", "6"],
    secondaryValues: ["250"],
    gridFactor: null,
    pricePerGallon: null,
  });
  // The second trip has no distance, so it contributes nothing; the first still counts.
  expect(result.kind).toBe("ok");
  if (result.kind !== "ok") return;
  expect(result.tonnes).toBeCloseTo(4 * 250 * 0.1 * 0.001, 10);
});

it("still treats a count with no distance at all as not reported", () => {
  const result = estimateSource({
    factor: countTimesDistanceFactor({ co2Factor: "0.1" }),
    values: ["4"],
    secondaryValues: [""],
    gridFactor: null,
    pricePerGallon: null,
  });
  expect(result.kind).toBe("notReported");
});
```

Reuse or add a `countTimesDistanceFactor` helper matching the existing helpers in that file.

Append to `src/lib/calc/__tests__/rollup.test.ts`:

```ts
it("prices a source from its trip rows, summing each product", () => {
  const r = rollupYear({
    year: 2024,
    gwpSet: "AR6",
    gridFactor: null,
    fuelPrices: null,
    entries: [
      tripEntry({
        element: "C9: Transporte terrestre de carga (camiones de servicio medianos y pesados)",
        unit: "ton * km",
        co2Factor: "0.127",
        trips: [
          { count: "12", distanceKm: "340" },
          { count: "5", distanceKm: "1200" },
        ],
      }),
    ],
  });
  expect(r.byScope.SCOPE_3 * 1000).toBeCloseTo((12 * 340 + 5 * 1200) * 0.127, 6);
});

it("falls back to value times secondaryValue when a source has no trip rows", () => {
  const r = rollupYear({
    year: 2024,
    gwpSet: "AR6",
    gridFactor: null,
    fuelPrices: null,
    entries: [
      tripEntry({
        element: "C7: Carro particular",
        unit: "vehículo * km",
        co2Factor: "0.1845",
        trips: [],
        value: "3",
        secondaryValue: "80",
      }),
    ],
  });
  expect(r.byScope.SCOPE_3 * 1000).toBeCloseTo(3 * 80 * 0.1845, 6);
});

it("treats a source with no trips and no value as not reported, contributing zero", () => {
  const r = rollupYear({
    year: 2024,
    gwpSet: "AR6",
    gridFactor: null,
    fuelPrices: null,
    entries: [
      tripEntry({
        element: "C7: Carro particular",
        unit: "vehículo * km",
        co2Factor: "0.1845",
        trips: [],
        value: null,
        secondaryValue: null,
      }),
    ],
  });
  expect(r.byScope.SCOPE_3).toBe(0);
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
bun run test -- preview rollup
```

Expected: FAIL. The preview multi-trip case returns 350 rather than 160; `trips` is not a known field on a rollup entry.

- [ ] **Step 3: Fix the preview aggregation**

Replace `src/lib/calc/preview.ts:160-164` with:

```ts
  } else if (entryMode === "COUNT_TIMES_DISTANCE") {
    // Each cell is one trip: sum the PRODUCTS, never the product of the sums. With a single trip
    // the two agree, which is why this went unnoticed until trip rows made N cells possible.
    let total = 0;
    let sawCount = false;
    let sawDistance = false;
    for (let i = 0; i < values.length; i++) {
      const count = sumActivity([values[i] ?? ""]);
      const distance = sumActivity([secondaryValues[i] ?? ""]);
      if (count.hasValues) sawCount = true;
      if (distance.hasValues) sawDistance = true;
      if (!count.hasValues || !distance.hasValues) continue;
      total += count.total * distance.total;
    }
    // Both halves must have been reported somewhere, which is the rule this mode has always
    // applied: a count with no distance is an unfinished entry, not a zero.
    hasValues = sawCount && sawDistance;
    activity = total;
  } else {
```

- [ ] **Step 4: Read trips in the rollup**

In `src/lib/calc/rollup.ts`, add to `RollupSourceRow`:

```ts
  /** One row per route for a COUNT_TIMES_DISTANCE source. When present these are the truth and
   *  `value`/`secondaryValue` are ignored; an entry saved before trip rows existed has none. */
  trips?: { count: string; distanceKm: string }[];
```

Replace the `COUNT_TIMES_DISTANCE` branch:

```ts
    } else if (entryMode === "COUNT_TIMES_DISTANCE") {
      const trips = entry.trips ?? [];
      if (trips.length > 0) {
        activity = trips.reduce(
          (sum, trip) => sum + parseActivity(trip.count) * parseActivity(trip.distanceKm),
          0,
        );
      } else {
        activity = parseActivity(entry.value) * parseActivity(entry.secondaryValue);
      }
```

Leave the surrounding "was this reported" logic exactly as it is: an entry with trips has a non-null `value` after the Task 8 backfill, and Task 10's action keeps `value` in step.

- [ ] **Step 5: Show the trips in the entered-activity column**

`src/lib/calc/format-entered-activity.ts:57` renders `value` and `secondaryValue` as "count x distance". When trips are present, render the trip count and the total instead, for example `3 viajes, 8.400 ton * km`. Add its i18n keys to both catalogs.

- [ ] **Step 6: Run to verify they pass**

```bash
bun run test -- preview rollup
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/calc src/messages/es.json src/messages/en.json
git commit -m "fix(calc): sum each trip's product instead of multiplying the sums

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: The trip rows Server Action

**Files:**
- Create: `src/features/data-entry/schemas/trip-schemas.ts`
- Create: `src/features/data-entry/schemas/__tests__/trip-schema.test.ts`
- Create: `src/features/data-entry/actions/trips.ts`
- Modify: `src/lib/auth/__tests__/action-authorization.test.ts`

**Interfaces:**
- Produces: `saveTransportTrips(input: { reportingYearId: string; entryId: string; trips: { reference: string; count: string; distanceKm: string; note: string }[] }): Promise<{ error?: string }>`.

- [ ] **Step 1: Write the failing schema test**

Create `src/features/data-entry/schemas/__tests__/trip-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { saveTransportTripsInput } from "../trip-schemas";

const base = {
  reportingYearId: "3f1a5b8c-0000-4000-8000-000000000001",
  entryId: "3f1a5b8c-0000-4000-8000-000000000002",
};

describe("saveTransportTripsInput", () => {
  it("accepts Colombian decimals and trims the text fields", () => {
    const parsed = saveTransportTripsInput.safeParse({
      ...base,
      trips: [{ reference: "  Bogotá a Cali  ", count: "4", distanceKm: "1240,5", note: "" }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.trips[0].distanceKm).toBe("1240.5");
    expect(parsed.data.trips[0].reference).toBe("Bogotá a Cali");
    expect(parsed.data.trips[0].note).toBeNull();
  });

  it("accepts an empty list, which clears the source", () => {
    expect(saveTransportTripsInput.safeParse({ ...base, trips: [] }).success).toBe(true);
  });

  it("refuses a negative distance and a non-numeric count", () => {
    expect(
      saveTransportTripsInput.safeParse({
        ...base,
        trips: [{ reference: "", count: "4", distanceKm: "-3", note: "" }],
      }).success,
    ).toBe(false);
    expect(
      saveTransportTripsInput.safeParse({
        ...base,
        trips: [{ reference: "", count: "abc", distanceKm: "3", note: "" }],
      }).success,
    ).toBe(false);
  });

  it("caps the batch and refuses an unexpected key", () => {
    const trip = { reference: "", count: "1", distanceKm: "1", note: "" };
    expect(
      saveTransportTripsInput.safeParse({ ...base, trips: Array(201).fill(trip) }).success,
    ).toBe(false);
    expect(
      saveTransportTripsInput.safeParse({ ...base, trips: [{ ...trip, extra: 1 }] }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
bun run test -- trip-schema
```

Expected: FAIL, cannot resolve `../trip-schemas`.

- [ ] **Step 3: Write the schema**

Create `src/features/data-entry/schemas/trip-schemas.ts`:

```ts
import { z } from "zod";
import { DECIMAL_20_6, isValidEntryValue, normalizeDecimalInput } from "@/lib/decimal-input";

// A trip's count and distance are required numbers, unlike ActivityEntry.value: an empty row is
// not saved at all, so there is no "not reported" state to represent here. Zero is allowed
// (a reported zero is an answer); negative is not.
const tripNumber = z
  .string()
  .transform((value) => normalizeDecimalInput(value.trim()))
  .refine((value) => value !== "" && isValidEntryValue(value) && DECIMAL_20_6.test(value), {
    message: "decimalInvalid",
  })
  .refine((value) => !value.startsWith("-"), { message: "negative" });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value): string | null => (value === "" ? null : value));

export const saveTransportTripsInput = z
  .object({
    reportingYearId: z.uuid(),
    entryId: z.uuid(),
    trips: z
      .array(
        z
          .object({
            reference: optionalText(200),
            count: tripNumber,
            distanceKm: tripNumber,
            note: optionalText(500),
          })
          .strict(),
      )
      // An empty array is meaningful: it clears the source back to "not reported".
      .max(200),
  })
  .strict();

type T = (key: string) => string;

/** Client-side field schema, translated. The server re-validates with the schema above. */
export function tripFieldSchema(t: T) {
  return z.object({
    count: z.string().refine((v) => isValidEntryValue(normalizeDecimalInput(v)), t("valueFormat")),
    distanceKm: z
      .string()
      .refine((v) => isValidEntryValue(normalizeDecimalInput(v)), t("valueFormat")),
  });
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
bun run test -- trip-schema
```

Expected: PASS.

- [ ] **Step 5: Write the action**

Create `src/features/data-entry/actions/trips.ts`. Model it on `src/features/data-entry/actions/entries.ts` exactly: `"use server"`, the same imports, the same `revalidate(scope)` and `auditKey(scope, reportingYearId)` helpers (import them if they are exported, otherwise copy them with the same comments).

```ts
// Replaces the whole trip set of one source in a single transaction. Replace rather than
// per-row create/update/delete: the set is small, the client always holds all of it, and a
// wholesale swap has no ordering races and no orphan rows to reconcile.
export async function saveTransportTrips(input: unknown): Promise<{ error?: string }> {
  const parsed = saveTransportTripsInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };
  const { reportingYearId, entryId, trips } = parsed.data;

  try {
    // Authorize FIRST, from the reporting year, never from an argument. Server Actions are
    // public POST endpoints and no layout guard has run.
    const scope = await resolveReportingYearScope(reportingYearId);

    // The entry must belong to this year AND this company, and its factor must actually be a
    // count-times-distance source. Anything else is treated as not found: never reveal whether
    // some other company's entry id exists.
    const entry = await prisma.activityEntry.findFirst({
      where: { id: entryId, reportingYearId, companyId: scope.companyId },
      select: {
        id: true,
        element: true,
        scope: true,
        emissionFactorId: true,
        emissionFactor: { select: { entryMode: true } },
      },
    });
    if (!entry || entry.emissionFactor?.entryMode !== "COUNT_TIMES_DISTANCE") {
      throw new ScopeError("not-found");
    }

    // value stays in step with the trips so every existing consumer of "was this reported"
    // keeps working: it is the sum of the products, and secondaryValue becomes 1 so the legacy
    // value x secondaryValue path can never disagree with the trip path.
    const total = trips.reduce(
      (sum, trip) => sum.add(new Prisma.Decimal(trip.count).mul(trip.distanceKm)),
      new Prisma.Decimal(0),
    );

    await prisma.$transaction(async (tx) => {
      await tx.transportTrip.deleteMany({ where: { activityEntryId: entryId } });
      if (trips.length > 0) {
        await tx.transportTrip.createMany({
          data: trips.map((trip, position) => ({
            activityEntryId: entryId,
            companyId: scope.companyId,
            position,
            reference: trip.reference,
            count: trip.count,
            distanceKm: trip.distanceKm,
            note: trip.note,
          })),
        });
      }
      await tx.activityEntry.update({
        where: { id: entryId },
        data: {
          value: trips.length === 0 ? null : total,
          secondaryValue: trips.length === 0 ? null : 1,
        },
      });
      await tx.activityEntryChange.create({
        data: {
          ...auditKey(scope, reportingYearId),
          emissionFactorId: entry.emissionFactorId,
          scope: entry.scope,
          element: entry.element,
          month: null,
          action: trips.length === 0 ? "VALUE_CLEARED" : "VALUE_SET",
          previousValue: null,
          newValue: trips.length === 0 ? null : total.toString(),
        },
      });
    });

    revalidate(scope);
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}
```

Match the exact field names of `ActivityEntryChange` when writing the audit row; read the model in `prisma/schema.prisma` around `:390` and adapt if `previousValue` / `newValue` are named differently.

- [ ] **Step 6: Prove it refuses a non-member**

Add `saveTransportTrips` to `src/lib/auth/__tests__/action-authorization.test.ts` alongside the other data-entry actions, asserting it returns the opaque error for a caller outside the company, and add `"transportTrip"` to the mocked model list at `:55-67`.

- [ ] **Step 7: Verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add src/features/data-entry/schemas src/features/data-entry/actions/trips.ts src/lib/auth/__tests__/action-authorization.test.ts
git commit -m "feat(data-entry): server action to save a source's trip rows

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Load trips and render the trip table

**Files:**
- Create: `src/features/data-entry/components/transport-trips-field.tsx`
- Create: `src/features/data-entry/hooks/use-transport-trips.ts`
- Modify: `src/features/data-entry/components/source-row.tsx` (replaces `DualValueField` for this mode)
- Modify: `src/features/data-entry/components/data-entry-screen.tsx`, `category-section.tsx`, `scope-tabs.tsx`, `lib/types.ts`, `lib/shape-entries.ts`
- Modify: `src/features/preview/lib/load-preview.ts`, `src/features/reports/lib/load-report.ts`, `src/features/dashboard/lib/dashboard-data.ts` (include trips so the engine sees them)
- Modify: `src/messages/es.json`, `src/messages/en.json`
- Delete: `src/features/data-entry/components/dual-value-field.tsx` once nothing imports it

**Interfaces:**
- Consumes: `saveTransportTrips` from Task 10, `RollupSourceRow.trips` from Task 9.
- Produces: `EntryCell.trips: { reference: string; count: string; distanceKm: string; note: string }[]` on the data-entry view model.

- [ ] **Step 1: Include trips in every query that feeds the engine**

In `load-preview.ts`, `load-report.ts` and `dashboard-data.ts`, add to the activity-entry `select`:

```ts
        trips: {
          select: { count: true, distanceKm: true },
          orderBy: { position: "asc" },
        },
```

and map them into `RollupSourceRow.trips` as strings:

```ts
    trips: row.trips.map((t) => ({
      count: t.count.toString(),
      distanceKm: t.distanceKm.toString(),
    })),
```

Decimals cross as strings. Update the mocked entry fixtures in the corresponding tests so the new field exists.

- [ ] **Step 2: Carry trips onto the data-entry view model**

In `data-entry-screen.tsx`, add the same `trips` select (with `reference`, `note` and `position` as well) and thread the rows through `shape-entries.ts` onto `EntryCell`. Do NOT put trip values into the autosave store: `hydrate()` deletes any key not in the incoming map, and the `":secondary"` key convention is already duplicated in three files. Trip state is local to the new component.

- [ ] **Step 3: Write the hook**

Create `src/features/data-entry/hooks/use-transport-trips.ts`. Hold the rows in `useState` seeded from props, wrap the save in `useTransition`, and surface the last error through `useToastAction`-style feedback, matching how `use-source-actions.ts` reports failures. On failure, roll the rows back to the last server-confirmed set, per the optimistic-write convention. Do not read `form.formState.isSubmitting`.

- [ ] **Step 4: Write the component**

Create `src/features/data-entry/components/transport-trips-field.tsx` (`"use client"`). It renders:

- a compact table with columns Referencia, Cantidad (labelled with the first half of the factor unit, from `unit.split(" * ")[0]` exactly as `dual-value-field.tsx` did), Distancia (km), Observaciones, and a remove button per row;
- an "Agregar viaje" button appending an empty row;
- a footer line showing the number of trips and the total, formatted with `useFormatter`, labelled with the factor's own unit;
- the same `aria-label` discipline the existing fields use, so each input names its element.

Save on blur and on row removal by calling the hook's save with the whole current set.

- [ ] **Step 5: Swap it in**

In `source-row.tsx`, render `<TransportTripsField ... />` where `factor.entryMode === "COUNT_TIMES_DISTANCE"`, in place of `<DualValueField />`. Note `source-row.tsx:39-40` returns null when `source.cells[0]` is absent; the trip table is per-source, not per-cell, so read the single annual cell exactly as today and pass its entry id.

Once no file imports `dual-value-field.tsx`, delete it and remove the now-unused `dataEntry.source.count` / `distance` keys only if nothing else uses them.

- [ ] **Step 6: Copy in both catalogs**

Under `dataEntry.trips` in `es.json`: `"title": "Viajes"`, `"reference": "Referencia"`, `"count": "Cantidad"`, `"distance": "Distancia (km)"`, `"note": "Observaciones"`, `"add": "Agregar viaje"`, `"remove": "Quitar viaje"`, `"empty": "Aún no hay viajes registrados."`, `"total": "{count, plural, one {# viaje} other {# viajes}}: {total} {unit}"`, `"saved": "Viajes guardados"`, `"saving": "Guardando viajes"`. Mirror in `en.json`.

- [ ] **Step 7: Verify in a browser**

```bash
bun run typecheck && bun run lint && bun run test && bun run build
bun run dev
```

Then, in the browser: open Ingreso de datos, Alcance 3, add a C9 freight source (`ton * km`), add two trips with different counts and distances, and confirm the footer total equals the sum of the products and that the Resumen and the Tablero show the same tonnes. Static checks passing is not evidence a feature works.

- [ ] **Step 8: Commit**

```bash
git add src/features src/messages/es.json src/messages/en.json
git commit -m "feat(data-entry): register transport trips row by row for C4, C6, C7 and C9

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Harden the importer

**Files:**
- Create: `src/lib/factor-import/derive-modes.ts`
- Create: `src/lib/factor-import/__tests__/derive-modes.test.ts`
- Modify: `prisma/import-factors.ts` (flag parsing `:66-84`, `resolveWorkbookPath:86-100`, `writeData:333-343`)
- Modify: `prisma/fix-travel-factors.ts` (the `where` clause at `:60-66`)

**Interfaces:**
- Produces: `deriveEntryMode(row: { unit: string; subcategory: string | null }): "QUANTITY" | "MONEY_PER_GALLON" | "COUNT_TIMES_DISTANCE"`, re-exporting `deriveFuelType` from `src/lib/calc/fuel.ts`.

**Why.** The importer never writes `entryMode`, so any factor it CREATES lands as `QUANTITY` even when its unit is `pasajeros * km`. A rename in the workbook makes the importer create a new row while existing entries stay bound to the old one; that is exactly how the km/mile travel correction silently reverted. And `fix-travel-factors.ts` selects every C6 and C7 factor, which sweeps in the two `gal` subsidy factors that were never mile-derived.

- [ ] **Step 1: Write the failing test**

Create `src/lib/factor-import/__tests__/derive-modes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveEntryMode } from "../derive-modes";

describe("deriveEntryMode", () => {
  it("marks every distance unit in the official sheet", () => {
    for (const unit of ["pasajeros * km", "vehículo * km", "ton * km"]) {
      expect(deriveEntryMode({ unit, subcategory: null })).toBe("COUNT_TIMES_DISTANCE");
    }
  });

  it("leaves km tubería alone: it is a plain length, not a count times a distance", () => {
    expect(deriveEntryMode({ unit: "km tubería", subcategory: null })).toBe("QUANTITY");
  });

  it("marks a transport subsidy as money per gallon", () => {
    expect(deriveEntryMode({ unit: "gal", subcategory: "Subsidios de transporte" })).toBe(
      "MONEY_PER_GALLON",
    );
  });

  it("leaves an ordinary gallon fuel factor as a quantity", () => {
    expect(deriveEntryMode({ unit: "gal", subcategory: "Fuentes móviles" })).toBe("QUANTITY");
    expect(deriveEntryMode({ unit: "Gal", subcategory: null })).toBe("QUANTITY");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
bun run test -- derive-modes
```

Expected: FAIL, cannot resolve `../derive-modes`.

- [ ] **Step 3: Write the module**

Create `src/lib/factor-import/derive-modes.ts`:

```ts
import type { EntryMode } from "@/lib/generated/prisma/client";

// How a workbook row's own columns decide which derivation the factor needs.
//
// Migration 20260815120000 set entryMode once, by hand, and warned that string matching is
// fragile as an ONGOING mechanism. That warning is about matching ELEMENT names, which drift.
// These two rules match the unit and the subcategory, both of which are part of the factor's
// natural key and come straight from the sheet, and they exist so a re-import cannot silently
// drop the mode off a renamed row and collapse a two-field entry into one pre-multiplied box.
//
// Verified against the official Emission Factors sheet (2026-09-03): the only units containing
// "km" are "pasajeros * km" (6 rows), "ton * km" (8) and "vehículo * km" (11), plus
// "km tubería" (4), which is a plain length and must NOT be swept in.
const DISTANCE_UNITS = new Set(["pasajeros * km", "ton * km", "vehículo * km"]);
const SUBSIDY_SUBCATEGORY = "Subsidios de transporte";

export function deriveEntryMode(row: { unit: string; subcategory: string | null }): EntryMode {
  if (DISTANCE_UNITS.has(row.unit)) return "COUNT_TIMES_DISTANCE";
  if (row.subcategory === SUBSIDY_SUBCATEGORY) return "MONEY_PER_GALLON";
  return "QUANTITY";
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
bun run test -- derive-modes
```

Expected: PASS.

- [ ] **Step 5: Write both derived columns on every import**

In `prisma/import-factors.ts`, extend `writeData` (around `:333`):

```ts
    const entryMode = deriveEntryMode({ unit: f.unit, subcategory: f.subcategory });
    const writeData = {
      // ... existing fields unchanged ...
      entryMode,
      fuelType: deriveFuelType({ entryMode, element: f.element }),
      versionId: latestVersionId,
    };
```

On the UPDATE path only, never downgrade a mode an admin deliberately set: if the derivation says `QUANTITY` but the stored row says otherwise, keep the stored value. On the CREATE path always use the derivation.

Add `entryMode` and `fuelType` to `FactorSnapshot` and to the diff builder so the change is audited like every other column.

- [ ] **Step 6: Refuse a silent misfire on the flags**

In `parseFlags`, reject an unknown flag and a `--file` with no value:

```ts
    if (arg === "--file") {
      const value = argv[++i];
      if (!value) throw new Error("--file needs a path");
      flags.file = value;
    } else if (arg.startsWith("--")) {
      // A typo like --dryrun used to be ignored, and the run WROTE.
      throw new Error(`Unknown flag: ${arg}`);
    }
```

In `resolveWorkbookPath`, validate the override before exceljs sees it:

```ts
  if (override) {
    const resolved = path.resolve(process.cwd(), override);
    if (!fs.existsSync(resolved)) throw new Error(`Workbook not found: ${resolved}`);
    if (!resolved.toLowerCase().endsWith(".xlsx")) {
      throw new Error(`Not an .xlsx workbook: ${resolved}`);
    }
    return resolved;
  }
```

- [ ] **Step 7: Narrow the travel fix to the mile-derived rows**

In `prisma/fix-travel-factors.ts`, the `where` at `:60-66` selects every C6 and C7 factor, which includes `C6: Gasolina E10 (Comercial) - Móvil` and `C6: Diésel B10 (Mezcla comercial) - Móvil`, both unit `gal`. Those are per-gallon combustion factors, not mile-derived, and dividing them by 1.609 squared understates them by 2,588881. Add the unit filter and say why:

```ts
    where: {
      scope: "SCOPE_3",
      // ONLY the rows the workbook built from a per-mile source. The two "gal" transport-subsidy
      // factors sit in the same C6 category but are per-gallon combustion factors that were never
      // converted from miles; dividing them here would understate them by 1.609^2.
      unit: { in: ["vehículo * km", "pasajeros * km"] },
      OR: [{ category: { startsWith: "C6" } }, { category: { startsWith: "C7" } }],
    },
```

Add a note in the file header recording that the subsidy rows were previously in scope, so whoever audits the library knows to check them.

- [ ] **Step 8: Verify and commit**

```bash
bun run typecheck && bun run lint && bun run test
git add src/lib/factor-import prisma/import-factors.ts prisma/fix-travel-factors.ts
git commit -m "fix(import): derive entryMode and fuelType, refuse a bad flag, narrow the travel fix

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: The re-pointing and re-apply scripts

**Files:**
- Create: `prisma/repoint-renamed-factors.ts`
- Create: `prisma/reapply-2026-09-03-factor-correction.ts`

**Interfaces:**
- Both follow the house convention: a dry run by default, writes only with `--apply`, idempotent through a `changedByEmail` marker, and a printed plan before any write.

- [ ] **Step 1: Write the re-pointing script**

Create `prisma/repoint-renamed-factors.ts`. Bootstrap exactly as `prisma/fix-2026-08-24-scope2-sin-rename.ts` does (`loadEnvConfig`, `PrismaPg`, `DIRECT_URL ?? DATABASE_URL`).

It must:

1. Find every pair of `EmissionFactor` rows sharing `(scope, category, unit)` where one is active with entries and the other is active without, or where two rows differ only in `element` or `subcategory`. Print each candidate pair with its entry counts.
2. For each pair the operator confirms by listing it in an explicit `PAIRS` constant at the top of the file (never automatic: a wrong guess re-prices real data), move `ActivityEntry.emissionFactorId` from the stale row to the current one with `updateMany`, **check `{ count }`**, copy `entryMode` and `fuelType` onto the surviving row, then deactivate the stale row rather than deleting it.
3. Write one `EmissionFactorChange` per surviving factor with `action: "UPDATED"` and `changedByEmail: "repunte-factores-2026-09-03"`, and one `ActivityEntryChange` per moved entry so the move is in the tenant audit trail.
4. Refuse to run if the target factor already has entries for the same reporting year and month, which would violate `@@unique([reportingYearId, emissionFactorId, month])`. Report those and skip them.

- [ ] **Step 2: Write the re-apply script**

Create `prisma/reapply-2026-09-03-factor-correction.ts`. The importer skips any factor carrying a non-`IMPORTED` change row, which protects the deliberate renames and regroupings but also freezes their numeric columns against the corrected sheet. This script re-applies only the numeric columns to exactly those factors.

It must:

1. Read the same workbook and sheet the importer reads, with the same `--file` flag and the same `mapRow` call, so the values come from one code path.
2. Select every factor with at least one non-`IMPORTED` change row.
3. Match each to its workbook row by `(scope, category, unit, element)` first, falling back to `(scope, category, unit)` plus a listed alias for the rows whose element was deliberately renamed (the SIN element and the two regrouped refrigerants). Print anything it cannot match and change nothing for it.
4. Update only `co2Factor`, `ch4Factor`, `n2oFactor`, `co2eFactor`, `gasType`, `factorUnit`, `source`, `biogenic`, `uncertaintyPct`. Never touch `element`, `subcategory` or `category`: those carry the human decision.
5. Write an `EmissionFactorChange` with `action: "UPDATED"` and `changedByEmail: "correccion-factores-2026-09-03"`, and skip any factor that already carries that marker so a re-run is a no-op.

- [ ] **Step 3: Verify the scripts compile and their dry runs are honest**

```bash
bun run typecheck && bun run lint
```

Do not run either script here. They run in Task 14, announced.

- [ ] **Step 4: Commit**

```bash
git add prisma/repoint-renamed-factors.ts prisma/reapply-2026-09-03-factor-correction.ts
git commit -m "feat(db): scripts to re-point renamed factors and re-apply the corrected values

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: The factor correction, run once, announced

**Files:** none. This task runs commands against the one shared Supabase database.

**Before running anything in this task, tell the user in the message beforehand:** which commands will run, that steps 1, 3 and 5 are read-only dry runs, that steps 2, 4, 6 and 7 write, and what each write changes. Do not retry a rejected command; stop and ask.

- [ ] **Step 1: Dry run the import against the official sheet**

```bash
bun prisma/import-factors.ts --dry-run --file "docs/sample-data/CEC-PR-F-024 - DASHBOARD (2025) - New (03-Sept-2026).xlsx"
```

Read the KEPT list line by line. Every KEPT row is a factor the guard is protecting and therefore one that Task 13's re-apply script must handle. Read the created count: a large number means a rename created duplicates and Task 13's re-point script has work to do. Do not proceed until both lists are understood.

- [ ] **Step 2: Apply the import**

```bash
bun prisma/import-factors.ts --file "docs/sample-data/CEC-PR-F-024 - DASHBOARD (2025) - New (03-Sept-2026).xlsx"
```

Do NOT pass `--apply-grid` or `--deactivate-leftovers`. The latter is driven purely by "is this natural key in the sheet I just read" and would deactivate large parts of the live library if pointed at the wrong file.

- [ ] **Step 3: Dry run the re-apply**

```bash
bun prisma/reapply-2026-09-03-factor-correction.ts --file "docs/sample-data/CEC-PR-F-024 - DASHBOARD (2025) - New (03-Sept-2026).xlsx"
```

- [ ] **Step 4: Apply the re-apply**

```bash
bun prisma/reapply-2026-09-03-factor-correction.ts --apply --file "docs/sample-data/CEC-PR-F-024 - DASHBOARD (2025) - New (03-Sept-2026).xlsx"
```

- [ ] **Step 5: Dry run the re-point**

```bash
bun prisma/repoint-renamed-factors.ts
```

Fill the `PAIRS` constant from what it prints, then dry run again and read the plan.

- [ ] **Step 6: Apply the re-point**

```bash
bun prisma/repoint-renamed-factors.ts --apply
```

- [ ] **Step 7: Re-apply the km/mile correction last**

The official sheet does **not** fix the km/mile error. Verified: it still carries 0,477873 for `C6: Carro particular`, which is 0,297 times 1,609, the overstated value. The correction must therefore be re-applied on top of the import, and it is idempotent through its `correccion-km-1609` marker, so already-corrected rows are skipped.

```bash
bun prisma/fix-travel-factors.ts
bun prisma/fix-travel-factors.ts --apply
```

- [ ] **Step 8: Prove the library is now what the acceptance test asserts**

```bash
bun run test -- parity
```

The in-repo fixture `src/lib/calc/__tests__/fixtures/parity/cecodes-dashboard-principal-2024.json` already carries the corrected factor values, so this passing means production now agrees with the acceptance test rather than the other way round.

- [ ] **Step 9: Drive the real flow in a browser**

Open the Tablero for a company with data. Confirm the totals moved as expected (some sources fall by 100 or 1.000 times), the gas chart still reconciles, and the report downloads. Open Ingreso de datos and confirm a C6 travel source still shows two fields and a C4 freight source now shows the trip table.

---

## Task 15: The dated correction notice

**Files:**
- Modify: `src/features/dashboard/components/dashboard-screen.tsx`
- Modify: `src/features/reports/lib/build-pdf.tsx` (the "Notas y advertencias" section)
- Modify: `src/messages/es.json`, `src/messages/en.json`
- Test: `src/features/reports/lib/__tests__/build-pdf.test.ts`

**Interfaces:**
- Produces: a fixed dated note, shown on the dashboard and printed in the report, so a reader who compares a figure against an older export can see why it moved.

- [ ] **Step 1: Add the copy**

In `es.json`, under `dashboard`: `"factorCorrectionNote": "Los factores de emisión se corrigieron el 3 de septiembre de 2026 con la tabla oficial de CECODES. Las cifras de todos los años se recalcularon con los factores corregidos."` Mirror in `en.json`.

- [ ] **Step 2: Show it on the dashboard**

Render it as a muted `<Note>` beside the existing biogenic and removals notes in `dashboard-screen.tsx`, using the same `Note` component and tone.

- [ ] **Step 3: Print it in the report**

Add the same sentence as the first line of the "Notas y advertencias" section in `build-pdf.tsx`, unconditionally.

- [ ] **Step 4: Keep the layout test honest**

`build-pdf.test.ts` asserts that no continuation page starts with something other than a column heading or a section title, and that headings never wrap. Run the suite and, if the new line shifts a page break, adjust the fixture expectations rather than the assertion.

- [ ] **Step 5: Verify and commit**

```bash
bun run typecheck && bun run lint && bun run test && bun run build
git add src/features src/messages/es.json src/messages/en.json
git commit -m "feat(dashboard,reports): dated notice that the factor table was corrected

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: Full verification

**Files:** none.

- [ ] **Step 1: Static checks and the full suite**

```bash
bun run typecheck && bun run lint && bun run test && bun run build
```

- [ ] **Step 2: No schema drift**

```bash
bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Expected: `-- This is an empty migration.` A proposal to DROP `emission_factors_natural_key`, `activity_entries_annual_source_key`, `transport_trips_non_negative` or any RLS object means the schema does not own it and the next person to run a schema tool will lose it.

- [ ] **Step 3: End to end**

```bash
bun run test:e2e
```

Anything the suite creates must carry an `E2E ` prefix or `purgeE2E` will not sweep it out of the client's real data. If a new global row type was introduced, add its DELETE to `e2e/fixture.ts`.

- [ ] **Step 4: The browser pass**

Sign in as a company user and walk the whole flow: the menu order, the company header with the new fields, entering a C4 freight source as trips, a C6 gasoline subsidy and a C6 diesel subsidy in the same year (confirm they divide by different prices), the gas chart, the Pareto highlight, the monthly line, and both report downloads. Sign in as the admin and edit a gasoline and a diesel price for the same year.

- [ ] **Step 5: Push**

```bash
git status --porcelain
git push origin main
```

Stage explicit file lists, never `git add -A`.

---

## Self-Review

**Spec coverage.** Phase 1 (E1) is Tasks 12, 13, 14 and 15. Phase 4 (E3, E4) is Tasks 4 to 11. The company profile fields the D5 header needs are Tasks 1 to 3. The spec's Phase 4 line "Correct the aggregation: preview.ts currently computes the product of the sums" is Task 9. Its "Widen the price column: Decimal(20,2) and its Zod refinement reject 16046.315789473685" is Tasks 4 and 7. Its "Two fuel prices per year, with a typed fuel column on the factor" is Tasks 4 and 5. Its "A trip detail table under an activity entry, with its own Server Action" is Tasks 8, 10 and 11. Phase 1's four bullets map to Task 14 step 1 (read the KEPT list), Task 13 step 2 (re-apply the refused rows), Task 13 step 1 (re-point stranded entries), Task 12 step 5 (carry entryMode) and Task 15 (the dated notice).

**Two findings this plan adds that the spec did not have**, both verified first-hand and both carrying a correction task: the official sheet does NOT fix the km/mile error, so `fix-travel-factors.ts` must run again after the import (Task 14 step 7); and that script's `where` clause sweeps in the two `gal` transport-subsidy factors that were never mile-derived, understating them by 2,588881 (Task 12 step 7). A third: the eight `ton * km` factors never got `COUNT_TIMES_DISTANCE`, so C4 and C9 freight has been forcing manual pre-multiplication (Task 8).

**Type consistency.** `FuelType` and `FuelPrices` are declared in Task 5 and used by the same names in Tasks 6, 7 and 12. `deriveFuelType` is declared in Task 5 and imported by Task 12. `deriveEntryMode` is declared in Task 12 only. `RollupSourceRow.trips` is declared in Task 9 and populated in Task 11. `saveTransportTripsInput` is declared in Task 10 and consumed by the action in the same task. `saveTransportTrips` is declared in Task 10 and called in Task 11.
