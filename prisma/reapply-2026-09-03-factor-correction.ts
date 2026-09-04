// Re-applies the corrected workbook's NUMERIC columns to the factors the importer refuses to
// touch.
//
//   bun prisma/reapply-2026-09-03-factor-correction.ts --file "<workbook>.xlsx"            # dry run
//   bun prisma/reapply-2026-09-03-factor-correction.ts --file "<workbook>.xlsx" --apply    # writes
//
// import-factors.ts leaves alone any factor carrying an EmissionFactorChange whose action is not
// IMPORTED ("never touch a human-edited factor"). That guard is right: it protects the deliberate
// renames and regroupings from being reverted by a workbook that still spells things the old way.
// But it protects the whole ROW, so those factors' numeric columns are frozen against a corrected
// sheet too: the import reports success while the wrong values stay in the library. CECODES sent a
// corrected table on 03-Sept-2026, so that gap has to be closed by hand, once.
//
// This script therefore re-applies ONLY the numbers and their provenance columns
// (co2Factor, ch4Factor, n2oFactor, co2eFactor, gasType, factorUnit, source, biogenic,
// uncertaintyPct). It never touches element, subcategory or category: those three carry the human
// decision the guard exists to protect, and rewriting them would undo the correction and re-create
// the duplicate-row bug that prisma/fix-2026-08-15-refrigerant-duplicate-regression.ts cleaned up.
//
// The values come from the same code path the importer uses (the same sheet predicate, the same
// mapRow) so they cannot drift from what a normal import would have written.

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, FactorChangeAction, type Prisma } from "@/lib/generated/prisma/client";
import {
  buildFactorDiff,
  isEmptyDiff,
  type FactorSnapshot,
} from "@/features/admin/lib/factor-diff";
import { mapRow, cellText, type MappedFactor, type RawRowCells } from "@/lib/factor-import/map-row";
import { datasourceUrl } from "../scripts/datasource";

const adapter = new PrismaPg({ connectionString: datasourceUrl() });
const prisma = new PrismaClient({ adapter });

// The marker that makes this script idempotent and traceable in the audit trail.
const CHANGED_BY = "correccion-factores-2026-09-03";

// Element names this library deliberately renamed, mapped to the name the workbook still uses, so
// a renamed row can still find its numbers. Matching is otherwise exact on
// (scope, category, unit, element); subcategory is left out of the key on purpose, because a
// regrouping changes it and the row is still the same source.
const ALIASES: Record<string, string> = {
  // Client feedback 2026-08-24, applied by prisma/fix-2026-08-24-scope2-sin-rename.ts.
  "SISTEMA INTERCONECTADO NACIONAL - SIN": "Electricidad (Sistema Interconectado Nacional - SIN)",
};

// Markers whose stored values deliberately SUPERSEDE the workbook, so re-applying the sheet to
// them would reinstate an error rather than correct one.
//
// prisma/fix-travel-factors.ts divides the C6/C7 travel factors by 1.609^2 because the sheet built
// them by multiplying a per-mile factor where it had to divide, and the 03-Sept-2026 sheet still
// carries the overstated numbers (0,477873 for "C6: Carro particular"). Worse, fix-travel-factors
// is idempotent through its own marker, so once these rows carry it, re-running it would SKIP them
// and the library would stay quietly wrong. They are listed and left alone instead.
const SUPERSEDING_MARKERS = ["correccion-km-1609"];

// The columns this script owns, in the order the plan prints them. Every other field, element,
// subcategory and category above all, keeps whatever the human decided.
const NUMERIC_FIELDS = [
  "co2Factor",
  "ch4Factor",
  "n2oFactor",
  "co2eFactor",
  "gasType",
  "factorUnit",
  "source",
  "biogenic",
  "uncertaintyPct",
] as const;

type Flags = { apply: boolean; file: string };

function parseFlags(argv: string[]): Flags {
  let apply = false;
  let file: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") {
      apply = true;
    } else if (arg === "--file") {
      const value = argv[++i];
      if (!value) throw new Error("--file needs a path");
      file = value;
    } else {
      // A typo must never be ignored here: this script writes to the factor library.
      throw new Error(`Unknown flag: ${arg}`);
    }
  }
  // Deliberately required, unlike the importer's default. This correction is against one specific
  // sheet CECODES sent; picking a workbook by convention would re-apply the wrong numbers.
  if (!file) throw new Error("--file <path to the corrected .xlsx> is required");
  return { apply, file };
}

function resolveWorkbookPath(file: string): string {
  const resolved = path.resolve(process.cwd(), file);
  if (!fs.existsSync(resolved)) throw new Error(`Workbook not found: ${resolved}`);
  if (!resolved.toLowerCase().endsWith(".xlsx")) {
    throw new Error(`Not an .xlsx workbook: ${resolved}`);
  }
  return resolved;
}

function rowCells(row: ExcelJS.Row): RawRowCells {
  const cells: RawRowCells = {};
  for (let c = 1; c <= 45; c++) cells[c] = row.getCell(c).value;
  return cells;
}

function workbookKey(scope: string, category: string, unit: string, element: string): string {
  return [scope, category, unit, element].join("|");
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const workbookPath = resolveWorkbookPath(flags.file);

  console.log(
    flags.apply ? "APPLYING" : "DRY RUN (nothing will be written; pass --apply to write)",
  );
  console.log(`Workbook: ${workbookPath}\n`);

  const byKey = await readWorkbook(workbookPath);
  console.log(`Read ${byKey.size} workbook row(s) with a usable factor.`);

  // Exactly the population the importer's guard skips.
  const factors = await prisma.emissionFactor.findMany({
    where: { changes: { some: { action: { not: FactorChangeAction.IMPORTED } } } },
    select: {
      id: true,
      scope: true,
      category: true,
      subcategory: true,
      element: true,
      unit: true,
      co2Factor: true,
      ch4Factor: true,
      n2oFactor: true,
      co2eFactor: true,
      gasType: true,
      factorUnit: true,
      source: true,
      biogenic: true,
      uncertaintyPct: true,
      changes: {
        where: { changedByEmail: { in: [CHANGED_BY, ...SUPERSEDING_MARKERS] } },
        select: { changedByEmail: true },
      },
    },
    orderBy: [{ scope: "asc" }, { category: "asc" }, { element: "asc" }],
  });
  console.log(`Found ${factors.length} factor(s) the importer keeps as human-edited.\n`);

  const aliasLines: string[] = [];
  const unmatchedLines: string[] = [];
  const supersededLines: string[] = [];
  let corrected = 0;
  let alreadyMarked = 0;
  let unchanged = 0;

  for (const factor of factors) {
    const markers = factor.changes.map((change) => change.changedByEmail);
    if (markers.includes(CHANGED_BY)) {
      alreadyMarked += 1;
      continue;
    }
    const superseding = markers.find((marker) => SUPERSEDING_MARKERS.includes(marker));
    if (superseding) {
      supersededLines.push(
        `  ${factor.category} / ${factor.element} (${factor.unit}) - corrected by "${superseding}", ` +
          "the sheet still carries the uncorrected value",
      );
      continue;
    }

    const direct = byKey.get(
      workbookKey(factor.scope, factor.category, factor.unit, factor.element),
    );
    const aliasElement = ALIASES[factor.element];
    const aliased = aliasElement
      ? byKey.get(workbookKey(factor.scope, factor.category, factor.unit, aliasElement))
      : undefined;
    const mapped = direct ?? aliased;

    if (!mapped) {
      unmatchedLines.push(
        `  ${factor.scope} / ${factor.category} / ${factor.subcategory ?? ""} / ` +
          `${factor.element} (${factor.unit})` +
          (aliasElement ? ` [alias "${aliasElement}" did not match either]` : ""),
      );
      continue;
    }
    if (!direct && aliasElement) {
      aliasLines.push(`  "${factor.element}" <- workbook "${aliasElement}"`);
    }

    // One object for both the comparison and the write, so the audit can never describe a
    // different set of columns from the one that was actually written.
    const values = {
      co2Factor: mapped.co2Factor,
      ch4Factor: mapped.ch4Factor,
      n2oFactor: mapped.n2oFactor,
      co2eFactor: mapped.co2eFactor,
      gasType: mapped.gasType,
      factorUnit: mapped.factorUnit,
      source: mapped.source,
      biogenic: mapped.biogenic,
      uncertaintyPct: mapped.uncertaintyPct,
    };
    const diff = buildFactorDiff(factor, values satisfies FactorSnapshot);
    if (isEmptyDiff(diff)) {
      unchanged += 1;
      continue;
    }

    const summary = NUMERIC_FIELDS.filter((field) => diff[field])
      .map((field) => `${field}: ${diff[field]!.from ?? "-"} -> ${diff[field]!.to ?? "-"}`)
      .join(", ");
    console.log(`  FIX  ${factor.element.padEnd(46)} ${summary}`);

    if (flags.apply) {
      await prisma.$transaction([
        prisma.emissionFactor.update({ where: { id: factor.id }, data: values }),
        prisma.emissionFactorChange.create({
          data: {
            factorId: factor.id,
            changedById: null,
            changedByEmail: CHANGED_BY,
            action: FactorChangeAction.UPDATED,
            changes: diff as Prisma.InputJsonValue,
          },
        }),
      ]);
    }
    corrected += 1;
  }

  printSection("Matched through an alias", aliasLines);
  printSection(
    "NOT in this workbook (left exactly as they are, nothing written)",
    unmatchedLines,
  );
  printSection(
    "Skipped: the stored value deliberately supersedes this workbook",
    supersededLines,
  );

  console.log("\n========== SUMMARY ==========");
  console.log(`  corrected:      ${corrected}`);
  console.log(`  alreadyMarked:  ${alreadyMarked}`);
  console.log(`  unchanged:      ${unchanged}`);
  console.log(`  superseded:     ${supersededLines.length}`);
  console.log(`  unmatched:      ${unmatchedLines.length}`);
  console.log("=============================");
  if (!flags.apply && corrected > 0) {
    console.log("Re-run with --apply to write. Every change lands in the factor's history.");
  }
}

// The same sheet the importer reads, chosen by the same predicate, mapped by the same mapRow.
async function readWorkbook(workbookPath: string): Promise<Map<string, MappedFactor>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);

  const sheet = workbook.worksheets.find(
    (ws) => ws.name.startsWith("Jerarqu") || ws.name === "Emission Factors",
  );
  if (!sheet) {
    throw new Error(
      'Neither a sheet starting with "Jerarqu" nor one named "Emission Factors" was found.',
    );
  }

  const byKey = new Map<string, MappedFactor>();
  for (let r = 3; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    if (cellText(row.getCell(1).value).trim() === "") continue;

    const result = mapRow(rowCells(row));
    if (!result.ok) continue; // the importer already reports these row by row

    const f = result.factor;
    const key = workbookKey(f.scope, f.category, f.unit, f.element);
    // First row wins, exactly as the importer's seenKeys guard does, so a duplicated key in the
    // sheet cannot make this script depend on row order.
    if (!byKey.has(key)) byKey.set(key, f);
  }
  return byKey;
}

function printSection(title: string, lines: string[]) {
  console.log(`\n--- ${title}: ${lines.length} ---`);
  for (const line of lines) console.log(line);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
