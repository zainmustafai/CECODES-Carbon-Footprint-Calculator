// One-time cleanup for a regression discovered by the 2026-08-15 client-feedback audit.
//
//   bun prisma/fix-2026-08-15-refrigerant-duplicate-regression.ts            # dry run
//   bun prisma/fix-2026-08-15-refrigerant-duplicate-regression.ts --apply    # writes
//
// prisma/fix-2026-08-15-client-feedback.ts correctly regrouped "Fugas de HCFC-22 / R-22" and
// "Fugas de Propano Alta Calidad / R-290" out of the client-flagged "Fugas de refrigerantes"
// (plural) group and into the correct "Fuga de refrigerantes" (singular) group, by editing each
// row's subcategory column directly.
//
// That correction is itself part of the bug it caused: import-factors.ts's natural-key lookup is
// {scope, category, element, unit, subcategory}, and the source workbook still has these two
// elements under the OLD (plural) subcategory - it was never edited, only the database row was.
// So the next re-import (the 2026-08-15 gasType backfill, phase 7 of the same feedback round)
// could not find the already-corrected row by natural key, treated the workbook's row as never
// seen before, and inserted a brand-new duplicate under the old grouping - reproducing the exact
// bug the client reported, on top of the correct row. import-factors.ts now has a structural fix
// (see its "editedSibling" check) so this cannot happen again on the next re-import; this script
// only removes the two duplicate rows that already exist from the one bad run.
//
// Confirmed via direct query before writing this: both duplicate rows have zero ActivityEntry
// references (they were created less than a day before this script was written), so deleting
// them is safe - same "0 references -> delete, otherwise deactivate" rule import-factors.ts's own
// starter cleanup already uses. This script re-checks that at runtime rather than trusting the
// investigation, and refuses to delete anything with a reference.

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, FactorChangeAction, type Prisma } from "../src/lib/generated/prisma/client";
import { datasourceUrl } from "../scripts/datasource";

const adapter = new PrismaPg({ connectionString: datasourceUrl() });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");

// The two elements the client named, under the specific (wrong, re-created) subcategory. Scoped
// this tightly on purpose - see "keep the correction constrained to the actual domain rule" in
// the audit follow-up task, not a general "deduplicate everything" sweep.
const DUPLICATE_MATCH: Prisma.EmissionFactorWhereInput = {
  scope: "SCOPE_1",
  category: "Emisiones Fugitivas",
  subcategory: "Fugas de refrigerantes", // the old, wrong grouping - the correct rows are singular
  element: { in: ["Fugas de HCFC-22 / R-22", "Fugas de Propano Alta Calidad / R-290"] },
};

async function main() {
  console.log(APPLY ? "APPLYING" : "DRY RUN (nothing will be written; pass --apply to write)");

  const duplicates = await prisma.emissionFactor.findMany({
    where: DUPLICATE_MATCH,
    select: { id: true, element: true, subcategory: true, createdAt: true },
  });

  console.log(`Found ${duplicates.length} duplicate row(s) under the wrong grouping.`);

  // Sanity check: the correct sibling (singular subcategory) must actually exist for each
  // duplicate, or this isn't the regression this script targets - refuse rather than guess.
  for (const dup of duplicates) {
    const correctSibling = await prisma.emissionFactor.findFirst({
      where: {
        scope: DUPLICATE_MATCH.scope,
        category: DUPLICATE_MATCH.category,
        element: dup.element,
        subcategory: "Fuga de refrigerantes", // singular - the client's intended grouping
      },
      select: {
        id: true,
        changes: { where: { action: { not: FactorChangeAction.IMPORTED } }, select: { id: true } },
      },
    });
    if (!correctSibling) {
      throw new Error(
        `Refusing: no correctly-grouped sibling found for "${dup.element}". This does not look ` +
          "like the regression this script targets - aborting without writing anything.",
      );
    }
    if (correctSibling.changes.length === 0) {
      throw new Error(
        `Refusing: the sibling for "${dup.element}" has never been admin-edited, so it is not ` +
          "the row prisma/fix-2026-08-15-client-feedback.ts corrected - aborting without writing anything.",
      );
    }

    const references = await prisma.activityEntry.count({ where: { emissionFactorId: dup.id } });
    if (references > 0) {
      throw new Error(
        `Refusing: duplicate row ${dup.id} ("${dup.element}") has ${references} activity ` +
          "entr(y/ies) against it. This script only deletes unreferenced duplicates - aborting " +
          "without writing anything so a human can decide what to do with that data.",
      );
    }

    console.log(`  DELETE  ${dup.element} (id ${dup.id}, created ${dup.createdAt.toISOString()}, 0 references)`);
    if (APPLY) {
      // EmissionFactorChange cascades on delete (onDelete: Cascade), so the duplicate's own
      // erroneous IMPORTED audit row goes with it - same as import-factors.ts's starter cleanup.
      await prisma.emissionFactor.delete({ where: { id: dup.id } });
    }
  }

  console.log(`\n${APPLY ? "Deleted" : "Would delete"} ${duplicates.length} duplicate row(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
