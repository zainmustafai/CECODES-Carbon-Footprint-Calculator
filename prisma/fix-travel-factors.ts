// Corrects the Scope 3 travel and commuting factors (C6, C7), which the source workbook built by
// MULTIPLYING a per-mile factor by 1.609 where it should have DIVIDED.
//
//   bun prisma/fix-travel-factors.ts            # dry run, prints the plan, writes nothing
//   bun prisma/fix-travel-factors.ts --apply    # writes, with a full audit trail
//
// THE EVIDENCE (from CECODES's own workbook, sheet "C6 Viajes C7 Desplazamiento Col"):
//
//   Rows 3-15 hold the source factors in per-MILE units:
//       D4 = 0.297 kg CO2 per milla-vehículo   (Coche de pasajeros)
//   Rows 17-22 convert them to per-KM units:
//       D18 = (D4 * $K$5)  ->  0.297 * 1.609 = 0.477873 kg CO2 per km-vehículo
//
// That is backwards. A factor expressed PER MILE becomes a factor PER KM by DIVIDING by 1.609,
// because one mile is 1.609 km, so the emissions of a mile are spread over 1.609 km:
//       0.297 kg/mile / 1.609 = 0.184587 kg/km
//
// The sheet makes the mistake visible: cell O10 converts a DISTANCE correctly
// (2300 miles * 1.609 = 3700 km), and the same multiply is then applied to a factor PER distance,
// where it must divide. Their own scratch cell N4 (= I4/K5) divides. Requirements 12.2 records
// that CECODES's change log had already flagged this.
//
// The stored value is therefore wrong by 1.609 squared:
//       stored  = per_mile * 1.609
//       correct = per_mile / 1.609 = stored / 1.609^2
// so every affected factor is overstated by a factor of ~2.589.
//
// This is applied here, in code, rather than by hand in the database, because it must be
// idempotent, reviewable, and reversible. Every change writes an EmissionFactorChange row exactly
// as an admin edit would, so the correction shows up in the factor's history in the UI with a
// from -> to for each column.
//
// SIDE EFFECT, AND IT IS THE ONE WE WANT: writing a non-IMPORTED change row marks these factors as
// human-edited, so prisma/import-factors.ts will never overwrite them from the (still wrong)
// workbook. If CECODES later sends a corrected sheet, delete the change rows or re-run the
// importer with an explicit override.

import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const APPLY = process.argv.includes("--apply");

// The marker that makes this script idempotent and traceable in the audit trail.
const CHANGED_BY = "correccion-km-1609";

const MILES_PER_KM = new Prisma.Decimal("1.609");
const OVERSTATEMENT = MILES_PER_KM.mul(MILES_PER_KM); // 1.609^2 = 2.588881

// The per-gas columns a travel factor can carry. Every one of them was built with the same
// multiply, so every one of them is wrong by the same ratio.
const FACTOR_COLUMNS = ["co2Factor", "ch4Factor", "n2oFactor", "co2eFactor"] as const;
type FactorColumn = (typeof FACTOR_COLUMNS)[number];

// Decimal(30,10) in the schema. Round to that scale so the write compares equal on a re-run
// instead of drifting in the last place.
const SCALE = 10;

async function main() {
  const factors = await prisma.emissionFactor.findMany({
    // C6 = Viajes de negocios, C7 = Desplazamiento de colaboradores. Both were converted on the
    // same sheet with the same broken formula.
    where: {
      scope: "SCOPE_3",
      OR: [{ category: { startsWith: "C6" } }, { category: { startsWith: "C7" } }],
    },
    select: {
      id: true,
      category: true,
      element: true,
      unit: true,
      co2Factor: true,
      ch4Factor: true,
      n2oFactor: true,
      co2eFactor: true,
      changes: {
        where: { changedByEmail: CHANGED_BY },
        select: { id: true },
        take: 1,
      },
    },
    orderBy: [{ category: "asc" }, { element: "asc" }],
  });

  console.log(
    `${APPLY ? "APPLYING" : "DRY RUN (nothing will be written; pass --apply to write)"}\n`,
  );
  console.log(`Found ${factors.length} Scope 3 travel/commuting factors.`);
  console.log(`Dividing every factor column by 1.609^2 = ${OVERSTATEMENT.toString()}\n`);

  let corrected = 0;
  let skipped = 0;

  for (const factor of factors) {
    if (factor.changes.length > 0) {
      console.log(`  SKIP (already corrected)  ${factor.element}`);
      skipped += 1;
      continue;
    }

    // Build the diff exactly as the admin UI does: { field: { from, to } }, Decimals as strings.
    const data: Record<string, Prisma.Decimal> = {};
    const changes: Record<string, { from: string | null; to: string }> = {};

    for (const column of FACTOR_COLUMNS) {
      const current = factor[column as FactorColumn];
      if (current === null) continue;

      const next = new Prisma.Decimal(current).div(OVERSTATEMENT).toDecimalPlaces(SCALE);
      data[column] = next;
      changes[column] = { from: current.toString(), to: next.toString() };
    }

    if (Object.keys(data).length === 0) {
      console.log(`  SKIP (no factor values)  ${factor.element}`);
      skipped += 1;
      continue;
    }

    const summary = Object.entries(changes)
      .map(([column, { from, to }]) => `${column}: ${from} -> ${to}`)
      .join(", ");
    console.log(`  FIX  ${factor.element.padEnd(38)} ${summary}`);

    if (APPLY) {
      await prisma.$transaction([
        prisma.emissionFactor.update({ where: { id: factor.id }, data }),
        prisma.emissionFactorChange.create({
          data: {
            factorId: factor.id,
            changedByEmail: CHANGED_BY,
            action: "UPDATED",
            changes: changes as Prisma.InputJsonValue,
          },
        }),
      ]);
    }
    corrected += 1;
  }

  console.log(
    `\n${APPLY ? "Corrected" : "Would correct"} ${corrected} factor(s); skipped ${skipped}.`,
  );
  if (!APPLY && corrected > 0) {
    console.log("Re-run with --apply to write. Every change lands in the factor's history.");
  }
  if (APPLY && corrected > 0) {
    console.log(
      "Done. These factors are now marked human-edited, so the importer will not " +
        "reinstate the workbook's wrong values.",
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
