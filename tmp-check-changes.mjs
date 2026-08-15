import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./src/lib/generated/prisma/client.ts";
const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const since = new Date(Date.now() - 30 * 60 * 1000); // last 30 min
const changes = await prisma.emissionFactorChange.findMany({
  where: { action: "IMPORTED", changedAt: { gte: since } },
  orderBy: { changedAt: "desc" },
  take: 500,
  select: { factorId: true, changes: true, changedAt: true, factor: { select: { scope: true, category: true, element: true } } },
});
console.log("total recent IMPORTED changes:", changes.length);

let onlyGasType = 0;
let otherFieldsChanged = 0;
const otherExamples = [];
for (const c of changes) {
  const fields = Object.keys(c.changes ?? {});
  const nonGasTypeFields = fields.filter((f) => f !== "gasType");
  if (nonGasTypeFields.length === 0) {
    onlyGasType++;
  } else {
    otherFieldsChanged++;
    if (otherExamples.length < 15) {
      otherExamples.push({ element: c.factor.element, category: c.factor.category, fields: nonGasTypeFields, changes: c.changes });
    }
  }
}
console.log("onlyGasType:", onlyGasType, "otherFieldsChanged:", otherFieldsChanged);
console.log(JSON.stringify(otherExamples, null, 2));

await prisma.$disconnect();
