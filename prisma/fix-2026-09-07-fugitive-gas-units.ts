// Client feedback (2026-09-07, item 11): the fugitive-emission refrigerant factors are labelled
// "kgCO2eq/kg", which reads as CO2e rather than as the gas itself. The client asked for the label
// to name the gas ("kgHFC/kg"), on the reasoning that the CO2e figure should be counted toward
// that gas's own total.
//
//   bun prisma/fix-2026-09-07-fugitive-gas-units.ts            # dry run
//   bun prisma/fix-2026-09-07-fugitive-gas-units.ts --apply    # writes
//
// THIS SCRIPT MOVES NO NUMBER, and that is the important thing to know before running it.
//
// Gas attribution never reads factorUnit. It reads the gasType column, which the importer sets
// from whichever of the workbook's HFC/PFC/SF6/NF3 block columns carried the value (map-row.ts).
// So a fugitive HFC's CO2e ALREADY lands in the HFC slice on the dashboard and in the kg HFCs
// column of the ISO 14064-1 declaration, added with an implicit GWP of 1, which is exactly the
// treatment the client described. What was wrong was only the label a reader sees next to it.
//
// The denominator is kept ("kgHFC/kg", not "kgHFC"). The workbook already spells three rows that
// way itself (kgSF6/kg, kgNF3/kg), and dropping it would make the Resumen's Factor column read
// "1960 kgHFC" with no per-unit basis.
//
// Scoped to rows that carry a gasType, and the new label is DERIVED from that column rather than
// parsed out of the element name. Nothing here may touch a factor whose value came from workbook
// column 9: map-row.ts decides CO2-versus-CO2e for those by matching /co2\s*eq?/i against the unit
// string, so stripping "CO2eq" from one would silently reclassify it as pure CO2 on the next
// import. Those rows have gasType null and are excluded by the where clause below.

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, FactorChangeAction } from "../src/lib/generated/prisma/client";
import { datasourceUrl } from "../scripts/datasource";

const adapter = new PrismaPg({ connectionString: datasourceUrl() });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");
const CHANGED_BY = "unidad-gas-fugitivas-2026-09-07";
const GAS_TYPES = ["HFC", "PFC", "SF6", "NF3"];

async function main() {
  console.log(APPLY ? "APPLYING" : "DRY RUN (nothing will be written; pass --apply to write)");

  const rows = await prisma.emissionFactor.findMany({
    where: {
      gasType: { in: GAS_TYPES },
      co2eFactor: { not: null },
      factorUnit: { contains: "co2", mode: "insensitive" },
    },
    select: { id: true, element: true, gasType: true, factorUnit: true },
  });
  console.log(`Found ${rows.length} pre-blended fugitive factor(s) with a CO2e unit label.\n`);

  let changed = 0;
  for (const row of rows) {
    const gas = (row.gasType ?? "").trim();
    if (!GAS_TYPES.includes(gas)) continue;
    // Keep whatever denominator the row already has: "kgCO2eq/kg" -> "kgHFC/kg", and a row with
    // no denominator stays without one rather than gaining an invented "/kg".
    const slash = (row.factorUnit ?? "").indexOf("/");
    const denominator = slash === -1 ? "" : (row.factorUnit ?? "").slice(slash);
    const next = `kg${gas}${denominator}`;
    if (next === row.factorUnit) continue;

    console.log(`  ${row.element}\n    "${row.factorUnit}" -> "${next}"`);
    changed += 1;

    if (APPLY) {
      await prisma.$transaction([
        prisma.emissionFactor.update({ where: { id: row.id }, data: { factorUnit: next } }),
        prisma.emissionFactorChange.create({
          data: {
            factorId: row.id,
            changedById: null,
            changedByEmail: CHANGED_BY,
            action: FactorChangeAction.UPDATED,
            changes: { factorUnit: { from: row.factorUnit, to: next } },
          },
        }),
      ]);
    }
  }

  console.log(`\n${APPLY ? "Relabelled" : "Would relabel"} ${changed} row(s). No totals change.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
