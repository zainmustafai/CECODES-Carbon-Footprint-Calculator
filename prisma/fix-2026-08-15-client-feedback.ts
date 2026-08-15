// Two data corrections from the client's 15-Aug-2026 feedback round
// (docs/client-comments/15-aug-2026/COMENTARIOS HUELLA CARBONO.pdf).
//
//   bun prisma/fix-2026-08-15-client-feedback.ts            # dry run, prints the plan, writes nothing
//   bun prisma/fix-2026-08-15-client-feedback.ts --apply    # writes, with a full audit trail
//
// 1. Gas classification: the client asked why "Fugas de HCFC-22 / R-22" and "Fugas de Propano
//    Alta Calidad / R-290" show up in their own separate dropdown group. group-factors.ts groups
//    strictly by exact category+subcategory string, and it is correct to do so - the bug is in the
//    data. These two elements (plus "Fugas de Chesterton (R) 296 EU / R-296", left untouched - see
//    below) sit under subcategory "Fugas de refrigerantes" (plural), while the other 29 pure-
//    substance refrigerant leaks (HFC-125, HFC-134a, SF6, NF3, ...) sit under "Fuga de
//    refrigerantes" (singular). HCFC-22 and R-290 are themselves pure substances, not blends, so
//    they belong with the 29-item group. Chesterton 296 is deliberately NOT moved here: it already
//    has a same-name duplicate row under "Fuga de mezclas refrigerantes" (the blends group), which
//    is a separate data-integrity question the client did not raise - flagged in the session
//    report instead of silently resolved.
//
// 2. Scope 2 naming: the client asked for the grid-electricity source name to read "Electricidad
//    (Sistema Interconectado Nacional - SIN)" instead of "Electricidad (Red Nacional - SIN)".
//
// Both changes are written as an audited EmissionFactorChange (action: UPDATED), exactly like an
// admin hand-edit, so prisma/import-factors.ts's "never touch a human-edited factor" rule protects
// them from being reverted by a future re-import of the source workbook.

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, FactorChangeAction, Prisma } from "../src/lib/generated/prisma/client";
import { buildFactorDiff, isEmptyDiff, type FactorSnapshot } from "../src/features/admin/lib/factor-diff";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");

type Fix = {
  marker: string;
  where: Prisma.EmissionFactorWhereInput;
  data: Prisma.EmissionFactorUpdateInput;
  label: string;
};

const FIXES: Fix[] = [
  {
    marker: "correccion-agrupacion-refrigerantes",
    where: {
      scope: "SCOPE_1",
      category: "Emisiones Fugitivas",
      subcategory: "Fugas de refrigerantes",
      element: { in: ["Fugas de HCFC-22 / R-22", "Fugas de Propano Alta Calidad / R-290"] },
    },
    data: { subcategory: "Fuga de refrigerantes" },
    label: "regroup HCFC-22 / R-290 into the pure-refrigerant subcategory",
  },
  {
    marker: "correccion-nombre-electricidad-sin",
    where: {
      scope: "SCOPE_2",
      element: "Electricidad (Red Nacional - SIN)",
    },
    data: { element: "Electricidad (Sistema Interconectado Nacional - SIN)" },
    label: "rename the Scope 2 grid-electricity source",
  },
];

async function main() {
  console.log(APPLY ? "APPLYING" : "DRY RUN (nothing will be written; pass --apply to write)");

  for (const fix of FIXES) {
    console.log(`\n${fix.label}`);
    const factors = await prisma.emissionFactor.findMany({ where: fix.where });

    if (factors.length === 0) {
      console.log("  no matching rows (already applied, or nothing to do)");
      continue;
    }

    for (const factor of factors) {
      const alreadyApplied = await prisma.emissionFactorChange.count({
        where: { factorId: factor.id, changedByEmail: fix.marker },
      });
      if (alreadyApplied > 0) {
        console.log(`  SKIP (already applied)  ${factor.element}`);
        continue;
      }

      const diff = buildFactorDiff(factor as unknown as FactorSnapshot, {
        ...(factor as unknown as FactorSnapshot),
        ...(fix.data as FactorSnapshot),
      });
      if (isEmptyDiff(diff)) {
        console.log(`  SKIP (no change)  ${factor.element}`);
        continue;
      }

      const summary = Object.entries(diff)
        .map(([field, { from, to }]) => `${field}: "${from}" -> "${to}"`)
        .join(", ");
      console.log(`  FIX  ${factor.element.padEnd(45)} ${summary}`);

      if (APPLY) {
        await prisma.$transaction([
          prisma.emissionFactor.update({ where: { id: factor.id }, data: fix.data }),
          prisma.emissionFactorChange.create({
            data: {
              factorId: factor.id,
              changedByEmail: fix.marker,
              action: FactorChangeAction.UPDATED,
              changes: diff as unknown as Prisma.InputJsonValue,
            },
          }),
        ]);
      }
    }
  }

  console.log(APPLY ? "\nDone." : "\nRe-run with --apply to write. Every change lands in the factor's history.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
