// Client feedback (2026-09-07, item 8): on the Resumen, the Scope 2 element reads
// "SISTEMA INTERCONECTADO NACIONAL - SIN" in full caps. It should be Title Case,
// "Sistema Interconectado Nacional - SIN", with SIN itself left upper.
//
//   bun prisma/fix-2026-09-07-scope2-sin-titlecase.ts            # dry run
//   bun prisma/fix-2026-09-07-scope2-sin-titlecase.ts --apply    # writes
//
// TWO tables, and missing the second is the whole trap. The Resumen does NOT read
// EmissionFactor.element: it reads ActivityEntry.element, a denormalized snapshot taken when the
// row was entered (see load-preview.ts and the comment on ActivityEntry.element in schema.prisma,
// which exists so an entry stays legible after its factor is renamed). Rename only the factor and
// the client sees no change at all and reports item 8 as ignored.
//
// This is deliberately NOT a display-time Title Case helper. 46 elements in the official workbook
// are legitimately all caps (HFC-23, PFC-318, R-410A, R-508B, ...) and a blanket transform renders
// them "Hfc-23" and "R-410a". It would also break AGENTS.md rule 5, which says element names come
// from the factor library exactly as the library spells them. One row's data is the narrow fix.
//
// Written as an audited EmissionFactorChange (action: UPDATED), exactly like an admin hand-edit,
// so import-factors.ts's "never touch a human-edited factor" rule protects it from a future
// re-import. The same reasoning as the 2026-08-24 rename this supersedes.

// AFTER YOU APPLY THIS, four hardcoded copies of the old spelling should follow it, and NOT
// before: while production still holds the old name, changing them is what breaks things.
//
//   prisma/seed.ts                              the starter Scope 2 row. Changing this first
//                                               makes the seed's findFirst miss the existing row
//                                               and insert a SECOND grid factor.
//   prisma/import-factors.ts GRID_PICKER_ELEMENT belt-and-braces only: the cleanup guard beside
//                                               it already preserves the row on scope === SCOPE_2,
//                                               so this one is safe either way.
//   prisma/reapply-2026-09-03-factor-correction.ts  its ALIASES key.
//   e2e/data-entry.spec.ts                      selects the source by the literal old name; the
//                                               spec fails until it is updated.
//
// Leaving them for now is deliberate: this script has not been applied, so the code and the data
// still agree.

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, FactorChangeAction } from "../src/lib/generated/prisma/client";
import { datasourceUrl } from "../scripts/datasource";

const adapter = new PrismaPg({ connectionString: datasourceUrl() });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");
const CHANGED_BY = "correccion-mayusculas-sin-2026-09-07";
const OLD_NAME = "SISTEMA INTERCONECTADO NACIONAL - SIN";
const NEW_NAME = "Sistema Interconectado Nacional - SIN";

async function main() {
  console.log(APPLY ? "APPLYING" : "DRY RUN (nothing will be written; pass --apply to write)");
  console.log(`  "${OLD_NAME}"\n  -> "${NEW_NAME}"\n`);

  // ---------------------------------------------------------------------------------------
  // 1. The factor itself.
  // ---------------------------------------------------------------------------------------
  const factors = await prisma.emissionFactor.findMany({
    where: { scope: "SCOPE_2", element: OLD_NAME },
    select: { id: true, element: true },
  });
  console.log(`emission_factors: ${factors.length} row(s) to rename.`);

  // The natural key includes element (a hand-written expression index, see schema.prisma), so a
  // row already carrying the new spelling would collide. Check before writing rather than
  // catching a unique-violation halfway through.
  const collision = await prisma.emissionFactor.count({
    where: { scope: "SCOPE_2", element: NEW_NAME },
  });
  if (collision > 0) {
    throw new Error(
      `A Scope 2 factor named "${NEW_NAME}" already exists (${collision} row(s)). ` +
        "Renaming would collide with the natural key. Resolve by hand.",
    );
  }

  // ---------------------------------------------------------------------------------------
  // 2. The entries that snapshot the name. This is what the Resumen actually renders.
  // ---------------------------------------------------------------------------------------
  const entryCount = await prisma.activityEntry.count({ where: { element: OLD_NAME } });
  console.log(`activity_entries: ${entryCount} row(s) carry the old label.`);

  if (!APPLY) {
    console.log("\nDry run complete. Nothing was written.");
    return;
  }

  for (const row of factors) {
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
    console.log(`  renamed factor ${row.id}`);
  }

  // updateMany returns { count } instead of throwing, so an unmatched write reports success.
  // Check the count against what the dry run measured (AGENTS.md).
  const updated = await prisma.activityEntry.updateMany({
    where: { element: OLD_NAME },
    data: { element: NEW_NAME },
  });
  console.log(`  renamed ${updated.count} activity entr(y|ies)`);
  if (updated.count !== entryCount) {
    throw new Error(
      `Expected to rename ${entryCount} activity entries but renamed ${updated.count}. ` +
        "Rolled nothing back; inspect before re-running.",
    );
  }

  // activity_entry_changes.element is deliberately left alone. Its column comment says it exists
  // so the audit log stays legible after a rename, and rewriting history to match the present is
  // the opposite of what an audit log is for. The consequence is visible and acceptable: the
  // Resumen's change log shows the old spelling on rows entered before today.

  console.log("\nDone.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
