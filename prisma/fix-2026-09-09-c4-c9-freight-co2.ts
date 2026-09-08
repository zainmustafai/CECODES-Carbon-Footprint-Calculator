// Client instruction (2026-09-09, by WhatsApp, not in the written comments document): the
// Scope 3 C4 and C9 freight factors measured per Ton*km are labelled "kg CO2e/ Ton*km" in the
// library but the value is CO2, so it should count under CO2 rather than as undisaggregated CO2e.
// "change CO2e for CO2 because it belongs to that gas".
//
//   bun prisma/fix-2026-09-09-c4-c9-freight-co2.ts            # dry run
//   bun prisma/fix-2026-09-09-c4-c9-freight-co2.ts --apply    # writes
//
// This is a label correction in the source workbook, not a modelling choice of ours. The same
// two categories already carry their "según vehículo usado" rows as "kg CO2/ Vehic*km", so the
// CO2e spelling on the per-tonne rows is inconsistent inside the client's own sheet.
//
// THE TOTAL DOES MOVE, UPWARD, and that surprised me when I ran it, so it is written down here.
//
// The CO2 part is a pure transfer: GWP of CO2 is 1, so the same number weighs the same whether it
// is read as CO2 or as CO2e. On the pilot company that was 5.293,3907 t moving out of
// "CO2e sin desagregar" and into CO2, to the fourth decimal.
//
// The increase comes from somewhere else. These rows ALSO carry their own ch4Factor and
// n2oFactor, and while the value sat in co2eFactor the engine took its pre-blended short-circuit
// (engine.ts: co2eFactor != null returns early) and never read them. Those gases were being
// silently discarded. Reading the row per-gas counts them, and on the pilot company that is
// 1,1566 t of CH4 plus 45,4569 t of N2O, totalling 46,6136 t, which matched the observed change
// exactly.
//
// That is a RECOVERY, not a double count. The workbook gives CO2, CH4 and N2O in separate columns
// for these rows, the same as the "según vehículo usado" rows beside them, and those siblings have
// always had all three counted because their unit column never said CO2e. The typo was in the unit
// string alone.
//
// The consequence is that a company reporting freight sees its total rise slightly. Tell them.
//
// Written as an audited EmissionFactorChange (action: UPDATED), like an admin hand-edit, so
// import-factors.ts's "never touch a human-edited factor" rule keeps a future re-import of the
// workbook from putting the CO2e label back.
//
// KNOWN GAP, deliberate: a brand new deployment that imports the workbook from scratch will read
// the CO2e label again, because map-row.ts transcribes the sheet rather than second-guessing it.
// The durable fix is the client correcting the unit column in their workbook. Until then, run
// this script after a fresh import. It is idempotent: rows already converted are skipped.

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, FactorChangeAction } from "../src/lib/generated/prisma/client";
import { datasourceUrl } from "../scripts/datasource";

const adapter = new PrismaPg({ connectionString: datasourceUrl() });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");
const CHANGED_BY = "correccion-co2-carga-c4-c9-2026-09-09";

async function main() {
  console.log(APPLY ? "APPLYING" : "DRY RUN (nothing will be written; pass --apply to write)");

  const rows = await prisma.emissionFactor.findMany({
    where: {
      scope: "SCOPE_3",
      OR: [{ category: { startsWith: "C4:" } }, { category: { startsWith: "C9:" } }],
      co2eFactor: { not: null },
      // Only the freight rows the client named. A spend-based row in these categories, if one is
      // ever added, is genuinely undisaggregated and must not be swept up by this.
      factorUnit: { contains: "co2e", mode: "insensitive" },
    },
    select: { id: true, category: true, element: true, co2eFactor: true, factorUnit: true, gasType: true },
    orderBy: [{ category: "asc" }, { element: "asc" }],
  });

  console.log(`Found ${rows.length} freight factor(s) stored as CO2e.\n`);

  let changed = 0;
  for (const row of rows) {
    // A gasType would mean the library DID identify a gas for this row, which is a different
    // situation from the mislabelled freight factors and is not ours to reinterpret.
    if (row.gasType !== null && row.gasType.trim() !== "") {
      console.log(`  SKIP (carries gasType ${row.gasType}) ${row.element}`);
      continue;
    }
    const value = row.co2eFactor!.toString();
    const nextUnit = (row.factorUnit ?? "").replace(/co2\s*e/gi, "CO2");
    console.log(`  ${row.category}`);
    console.log(`    ${row.element}`);
    console.log(`    ${value} "${row.factorUnit}"  ->  CO2 ${value} "${nextUnit}"`);
    changed += 1;

    if (APPLY) {
      await prisma.$transaction([
        prisma.emissionFactor.update({
          where: { id: row.id },
          data: { co2Factor: value, co2eFactor: null, factorUnit: nextUnit },
        }),
        prisma.emissionFactorChange.create({
          data: {
            factorId: row.id,
            changedById: null,
            changedByEmail: CHANGED_BY,
            action: FactorChangeAction.UPDATED,
            changes: {
              co2Factor: { from: null, to: value },
              co2eFactor: { from: value, to: null },
              factorUnit: { from: row.factorUnit, to: nextUnit },
            },
          },
        }),
      ]);
    }
  }

  console.log(`\n${APPLY ? "Converted" : "Would convert"} ${changed} factor(s) from CO2e to CO2.`);
  console.log("The CO2 amount transfers 1:1. Any increase is CH4 and N2O that the");
  console.log("pre-blended short-circuit was discarding. See this file's header.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
