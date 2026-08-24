// Client feedback (2026-08-24): rename the Scope 2 grid-electricity element from
// "Electricidad (Sistema Interconectado Nacional - SIN)" to just "SISTEMA INTERCONECTADO
// NACIONAL - SIN".
//
//   bun prisma/fix-2026-08-24-scope2-sin-rename.ts            # dry run
//   bun prisma/fix-2026-08-24-scope2-sin-rename.ts --apply    # writes
//
// Written as an audited EmissionFactorChange (action: UPDATED), exactly like an admin hand-edit,
// so import-factors.ts's "never touch a human-edited factor" rule protects it from being
// reverted by a future re-import of the source workbook (the workbook itself still has the old
// name in this column, same situation as the 2026-08-15 Scope 2 rename before this one).

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, FactorChangeAction } from "../src/lib/generated/prisma/client";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");
const CHANGED_BY = "correccion-nombre-sin-2026-08-24";
const OLD_NAME = "Electricidad (Sistema Interconectado Nacional - SIN)";
const NEW_NAME = "SISTEMA INTERCONECTADO NACIONAL - SIN";

async function main() {
  console.log(APPLY ? "APPLYING" : "DRY RUN (nothing will be written; pass --apply to write)");

  const rows = await prisma.emissionFactor.findMany({
    where: { scope: "SCOPE_2", element: OLD_NAME },
    select: { id: true, element: true },
  });
  console.log(`Found ${rows.length} row(s) named "${OLD_NAME}".`);

  for (const row of rows) {
    console.log(`  RENAME  ${row.id}: "${row.element}" -> "${NEW_NAME}"`);
    if (APPLY) {
      await prisma.$transaction([
        prisma.emissionFactor.update({ where: { id: row.id }, data: { element: NEW_NAME } }),
        prisma.emissionFactorChange.create({
          data: {
            factorId: row.id,
            changedById: null,
            changedByEmail: CHANGED_BY,
            action: FactorChangeAction.UPDATED,
            changes: { element: { from: row.element, to: NEW_NAME } },
          },
        }),
      ]);
    }
  }

  console.log(`\n${APPLY ? "Renamed" : "Would rename"} ${rows.length} row(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
