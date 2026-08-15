import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./src/lib/generated/prisma/client";
import { rollupYear } from "./src/lib/calc/rollup";
import { toRollupEntries } from "./src/lib/calc/rollup-entries";
import { resolveGwpSet } from "./src/lib/gwp";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const user = await prisma.appUser.findUnique({ where: { id: "4bcf9237-a535-4d7f-aabc-94398a17abec" } });
console.log("user:", user?.email, user?.companyId);

const companyId = user!.companyId!;
const reportingYears = await prisma.reportingYear.findMany({ where: { companyId, year: 2025 } });
const ids = reportingYears.map((r) => r.id);
console.log("reportingYearIds for 2025:", ids);

const entries = await prisma.activityEntry.findMany({
  where: { reportingYearId: { in: ids } },
  select: {
    scope: true, category: true, subcategory: true, element: true, month: true, value: true, secondaryValue: true,
    emissionFactor: {
      select: { co2Factor: true, ch4Factor: true, n2oFactor: true, co2eFactor: true, biogenic: true, entryMode: true, gasType: true },
    },
  },
});

const grid = await prisma.gridElectricityFactor.findUnique({ where: { year: 2025 } });
const price = await prisma.transportSubsidyPrice.findUnique({ where: { year: 2025 } });

const rollup = rollupYear({
  entries: toRollupEntries(entries),
  gridFactor: grid ? grid.factor.toString() : null,
  pricePerGallon: price ? price.pricePerGallonCop.toString() : null,
  gwpSet: (reportingYears[0]?.gwpSet ?? resolveGwpSet(2025)) as any,
});

console.log("totalTonnes:", rollup.totalTonnes);
for (const c of rollup.byCategory) {
  if (c.otherGasesTonnes > 0) {
    console.log(JSON.stringify({
      category: c.category,
      otherGasesTonnes: c.otherGasesTonnes,
      otherGasesByType: c.otherGasesByType,
      otherGasesEntries: c.otherGasesEntries,
    }));
  }
}

// Also print the raw entries that are pre-blended (co2eFactor set) to see their gasType.
console.log("--- raw pre-blended entries ---");
for (const e of entries) {
  if (e.emissionFactor?.co2eFactor != null) {
    console.log(JSON.stringify({
      scope: e.scope, category: e.category, element: e.element, value: e.value?.toString(),
      co2eFactor: e.emissionFactor.co2eFactor?.toString(), gasType: e.emissionFactor.gasType,
    }));
  }
}

await prisma.$disconnect();
