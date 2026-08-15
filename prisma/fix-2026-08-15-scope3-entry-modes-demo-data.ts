// One-time correction for the demo company's ("Demo Alimentos del Valle") pre-existing
// ActivityEntry rows against factors that just gained a new EntryMode (client feedback
// 2026-08-15, Scope 3 Cat 6/7). These 10 rows were entered through the app UI before this
// feature existed, when their single `value` field meant "the final activity quantity" under
// every factor. Reinterpreting that same stored number under the new formula - divide by a
// price for MONEY_PER_GALLON, multiply by a (currently null) secondaryValue for
// COUNT_TIMES_DISTANCE - would silently change their computed emissions without anyone editing
// anything. This script makes both entry modes compute EXACTLY what they did before:
//
//   bun prisma/fix-2026-08-15-scope3-entry-modes-demo-data.ts            # dry run
//   bun prisma/fix-2026-08-15-scope3-entry-modes-demo-data.ts --apply    # writes
//
// COUNT_TIMES_DISTANCE: backfill secondaryValue = 1 (the multiplicative identity), so
// `value * secondaryValue` still equals the original value.
//
// MONEY_PER_GALLON: there is no such identity for division. Instead this seeds a
// TransportSubsidyPrice for every year these rows touch (2023/2024/2025 - a plausible, rounded
// COP/gal reference series, clearly logged as such; this is demo reference data, not a claim
// about what the company actually paid) and rewrites each row's stored `value` from gallons to
// the COP amount that divides back to the exact same gallons: `value * price`.
//
// Scoped to non-QUANTITY factors only, so it can never touch a real company's QUANTITY entries.
// Confirmed via direct query before writing this: every affected row belongs to the seeded demo
// company, none to a real client tenant.

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../src/lib/generated/prisma/client";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");
const CHANGED_BY = "correccion-scope3-entry-modes-demo";

// Plausible, rounded Colombian gasoline reference prices, rising year over year - demo
// reference data, not a record of what the company actually paid.
const DEMO_SUBSIDY_PRICES: Record<number, string> = {
  2023: "10800",
  2024: "12500",
  2025: "13800",
};

async function main() {
  console.log(APPLY ? "APPLYING" : "DRY RUN (nothing will be written; pass --apply to write)");

  const entries = await prisma.activityEntry.findMany({
    where: {
      value: { not: null },
      emissionFactor: { entryMode: { not: "QUANTITY" } },
    },
    select: {
      id: true,
      element: true,
      value: true,
      secondaryValue: true,
      companyId: true,
      reportingYearId: true,
      scope: true,
      month: true,
      reportingYear: { select: { year: true } },
      emissionFactor: { select: { entryMode: true } },
    },
  });

  console.log(`Found ${entries.length} pre-existing entr${entries.length === 1 ? "y" : "ies"}.`);
  const companies = await prisma.company.findMany({
    where: { id: { in: [...new Set(entries.map((e) => e.companyId))] } },
    select: { id: true, name: true },
  });
  const companyNameById = new Map(companies.map((c) => [c.id, c.name]));
  for (const e of entries) {
    const companyName = companyNameById.get(e.companyId);
    if (companyName !== "Demo Alimentos del Valle") {
      // Refuse to touch anything outside the one company this was verified against.
      throw new Error(
        `Refusing: entry ${e.id} belongs to "${companyName}", not the demo company. Aborting without writing anything.`,
      );
    }
  }

  // ---- 1. Seed the reference prices these rows' years need. ----
  const years = [...new Set(entries.map((e) => e.reportingYear.year))].filter(
    (y): y is number => y in DEMO_SUBSIDY_PRICES,
  );
  for (const year of years) {
    const price = DEMO_SUBSIDY_PRICES[year];
    console.log(`  PRICE  ${year}: ${price} COP/gal (demo reference)`);
    if (APPLY) {
      await prisma.transportSubsidyPrice.upsert({
        where: { year },
        create: {
          year,
          pricePerGallonCop: price,
          source: "Precio promedio de referencia (demo)",
          updatedByEmail: CHANGED_BY,
        },
        update: {},
      });
    }
  }

  // ---- 2. Fix each entry so its computed activity is unchanged. ----
  let fixed = 0;
  let skipped = 0;
  for (const entry of entries) {
    // The where clause above already required emissionFactor.entryMode != QUANTITY, which is
    // impossible to satisfy for a null relation - this narrows the type, not the runtime set.
    if (!entry.emissionFactor) {
      throw new Error(`Refusing: entry ${entry.id} matched the query but has no emissionFactor.`);
    }
    if (entry.emissionFactor.entryMode === "COUNT_TIMES_DISTANCE") {
      if (entry.secondaryValue !== null) {
        console.log(`  SKIP (already has a distance)  ${entry.element}`);
        skipped += 1;
        continue;
      }
      console.log(`  FIX  ${entry.element.padEnd(50)} secondaryValue: null -> 1 (preserves ${entry.value})`);
      if (APPLY) {
        await prisma.$transaction([
          prisma.activityEntry.update({ where: { id: entry.id }, data: { secondaryValue: "1" } }),
          prisma.activityEntryChange.create({
            data: {
              reportingYearId: entry.reportingYearId,
              companyId: entry.companyId,
              emissionFactorId: null,
              scope: entry.scope,
              element: entry.element,
              month: entry.month,
              changedByEmail: CHANGED_BY,
              action: "VALUE_SET",
              changes: { secondaryValue: { from: null, to: "1" } },
            },
          }),
        ]);
      }
      fixed += 1;
      continue;
    }

    // MONEY_PER_GALLON
    const price = DEMO_SUBSIDY_PRICES[entry.reportingYear.year];
    if (!price) {
      console.log(`  SKIP (no reference price for ${entry.reportingYear.year})  ${entry.element}`);
      skipped += 1;
      continue;
    }
    const gallons = entry.value!;
    const cop = new Prisma.Decimal(gallons).mul(new Prisma.Decimal(price)).toDecimalPlaces(6);
    console.log(
      `  FIX  ${entry.element.padEnd(50)} value: ${gallons} gal -> ${cop.toString()} COP (at ${price} COP/gal, ${entry.reportingYear.year})`,
    );
    if (APPLY) {
      await prisma.$transaction([
        prisma.activityEntry.update({ where: { id: entry.id }, data: { value: cop } }),
        prisma.activityEntryChange.create({
          data: {
            reportingYearId: entry.reportingYearId,
            companyId: entry.companyId,
            emissionFactorId: null,
            scope: entry.scope,
            element: entry.element,
            month: entry.month,
            changedByEmail: CHANGED_BY,
            action: "VALUE_SET",
            changes: { value: { from: gallons.toString(), to: cop.toString() } },
          },
        }),
      ]);
    }
    fixed += 1;
  }

  console.log(`\n${APPLY ? "Fixed" : "Would fix"} ${fixed} entr${fixed === 1 ? "y" : "ies"}; skipped ${skipped}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
