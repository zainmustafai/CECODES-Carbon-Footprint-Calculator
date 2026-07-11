// Excel emission-factor importer.
//
//   bun prisma/import-factors.ts [--dry-run] [--file <path>]
//
// Reads the authoritative per-gas table on the "Jerarquia nueva (2025)" sheet of CECODES's
// factor workbook and reconciles it into emission_factors. It is idempotent and it never
// clobbers a human edit: a factor that carries any EmissionFactorChange whose action is not
// IMPORTED is left untouched. A second consecutive run reports everything as unchanged.
//
// What it deliberately does NOT do:
//   - It never inserts the Scope-2 "UPME <year>" rows as emission_factors. Grid electricity is
//     modelled as one picker element plus grid_electricity_factors keyed by year, so those rows
//     are only COMPARED against that table and reported. A grid factor is never auto-overwritten.
//   - It never reads column 15 or 21 (the sheet's cached kg formula results). CH4 and N2O come
//     from the gram columns 14 and 20, divided by 1000 with Decimal. A consequence: rows that
//     express CH4/N2O only in the kg columns map to no-factor and are reported, not imported.
//   - It never hard-deletes a factor that has activity entries: it deactivates it instead.
//
// Bootstrap mirrors prisma/seed.ts. A plain `bun prisma/import-factors.ts` does not read
// .env.local by itself, so loadEnvConfig runs first, exactly as playwright.config.ts does.

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  Prisma,
  Scope,
  FactorChangeAction,
} from "../src/lib/generated/prisma/client";
import {
  buildCreationDiff,
  buildFactorDiff,
  isEmptyDiff,
  type FactorSnapshot,
} from "../src/features/admin/lib/factor-diff";
import { mapRow, cellText, type RawRowCells } from "../src/lib/factor-import/map-row";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const REFERENCE_DIR = path.join(process.cwd(), "docs", "reference");
const IMPORTER_EMAIL = "importador";
// The Scope-2 element the data-entry source picker depends on. Never removed by cleanup.
const GRID_PICKER_ELEMENT = "Electricidad (Red Nacional - SIN)";
const STARTER_SUFFIX = "(starter)";

type Flags = { dryRun: boolean; file: string | null };

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { dryRun: false, file: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--file") flags.file = argv[++i] ?? null;
  }
  return flags;
}

// The single .xlsx in docs/reference. Its real name contains an accented "emision", so it is
// resolved by extension rather than by a hardcoded name.
function resolveWorkbookPath(override: string | null): string {
  if (override) return override;
  const candidates = fs
    .readdirSync(REFERENCE_DIR)
    .filter((name) => name.toLowerCase().endsWith(".xlsx"));
  if (candidates.length === 0) {
    throw new Error(`No .xlsx workbook found in ${REFERENCE_DIR}`);
  }
  if (candidates.length > 1) {
    throw new Error(
      `Expected exactly one .xlsx in ${REFERENCE_DIR}, found: ${candidates.join(", ")}`,
    );
  }
  return path.join(REFERENCE_DIR, candidates[0]);
}

function rowCells(row: ExcelJS.Row): RawRowCells {
  const cells: RawRowCells = {};
  for (let c = 1; c <= 45; c++) cells[c] = row.getCell(c).value;
  return cells;
}

// A 4-digit year embedded in a Scope-2 element label, or null (the RECs / self-generated row).
function extractYear(element: string): number | null {
  const match = /(\d{4})/.exec(element);
  return match ? Number(match[1]) : null;
}

function snapshotFromFactor(f: {
  scope: Scope;
  category: string;
  subcategory: string | null;
  element: string;
  unit: string;
  co2Factor: string | null;
  ch4Factor: string | null;
  n2oFactor: string | null;
  co2eFactor: string | null;
  factorUnit: string | null;
  source: string | null;
  biogenic: boolean;
  uncertaintyPct: string | null;
}): FactorSnapshot {
  return {
    scope: f.scope,
    category: f.category,
    subcategory: f.subcategory,
    element: f.element,
    unit: f.unit,
    co2Factor: f.co2Factor,
    ch4Factor: f.ch4Factor,
    n2oFactor: f.n2oFactor,
    co2eFactor: f.co2eFactor,
    factorUnit: f.factorUnit,
    source: f.source,
    biogenic: f.biogenic,
    uncertaintyPct: f.uncertaintyPct,
  };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const workbookPath = resolveWorkbookPath(flags.file);

  console.log(`Emission-factor importer${flags.dryRun ? " (DRY RUN, no writes)" : ""}`);
  console.log(`Workbook: ${workbookPath}\n`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);

  const sheet = workbook.worksheets.find((ws) => ws.name.startsWith("Jerarqu"));
  if (!sheet) throw new Error('Sheet starting with "Jerarqu" not found in the workbook.');

  const latestVersion = await prisma.emissionFactorVersion.findFirst({
    orderBy: { date: "desc" },
  });
  const latestVersionId = latestVersion?.id ?? null;
  console.log(
    latestVersion
      ? `Linking imported factors to version ${latestVersion.version}.`
      : "No emission-factor version found; imported factors will have no versionId.",
  );

  const counts = {
    created: 0,
    updated: 0,
    unchanged: 0,
    keptAdminEdited: 0,
    skippedNoFactor: 0,
    skippedAmbiguous: 0,
    skippedBadScope: 0,
    skippedIncomplete: 0,
    skippedDuplicate: 0,
    skippedScope2: 0,
    starterDeleted: 0,
    starterDeactivated: 0,
  };

  // Detail lines, collected and printed above the summary so nothing is silently dropped.
  const skipLines: string[] = [];
  const keptLines: string[] = [];
  const gridMatchLines: string[] = [];
  const gridMismatchLines: string[] = [];
  const gridMissingLines: string[] = [];
  const gridPendingLines: string[] = [];
  const starterLines: string[] = [];

  const seenKeys = new Set<string>();

  for (let r = 3; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    // A row with no Alcance cell is empty spreadsheet space, not a dropped data row.
    if (cellText(row.getCell(1).value).trim() === "") continue;

    const cells = rowCells(row);
    const result = mapRow(cells);

    if (!result.ok) {
      const label = `${cellText(cells[2]).trim()} / ${cellText(cells[4]).trim()}`;
      skipLines.push(`  row ${r}: SKIP ${result.reason} - ${label}`);
      if (result.reason === "no-factor") counts.skippedNoFactor++;
      else if (result.reason === "ambiguous-factor") counts.skippedAmbiguous++;
      else if (result.reason === "bad-scope") counts.skippedBadScope++;
      else counts.skippedIncomplete++;
      continue;
    }

    const f = result.factor;

    // Scope 2 is grid electricity: compare, never insert.
    if (f.scope === Scope.SCOPE_2) {
      counts.skippedScope2++;
      const value = f.co2eFactor ?? f.co2Factor;
      const year = extractYear(f.element);
      if (year === null || value === null) {
        gridPendingLines.push(
          `  row ${r}: GRID PENDING (no year / renewable) value=${value ?? "-"} - ${f.element}`,
        );
        continue;
      }
      const grid = await prisma.gridElectricityFactor.findUnique({ where: { year } });
      if (!grid) {
        gridMissingLines.push(`  row ${r}: GRID MISSING year ${year} (Excel ${value}) not in database`);
      } else if (!new Prisma.Decimal(value).eq(grid.factor)) {
        gridMismatchLines.push(
          `  row ${r}: GRID WARN year ${year}: Excel ${value} vs database ${grid.factor.toString()} (not overwritten)`,
        );
      } else {
        gridMatchLines.push(`  row ${r}: GRID OK year ${year}: ${value}`);
      }
      continue;
    }

    // Idempotency guard against any accidental duplicate natural key in the sheet.
    const key = [f.scope, f.category, f.subcategory ?? "", f.element, f.unit].join("|");
    if (seenKeys.has(key)) {
      counts.skippedDuplicate++;
      skipLines.push(`  row ${r}: SKIP duplicate-key - ${f.category} / ${f.element}`);
      continue;
    }
    seenKeys.add(key);

    const existing = await prisma.emissionFactor.findFirst({
      where: {
        scope: f.scope,
        category: f.category,
        element: f.element,
        unit: f.unit,
        subcategory: f.subcategory, // null => IS NULL, which is what the natural key wants
      },
    });

    const writeData = {
      co2Factor: f.co2Factor,
      ch4Factor: f.ch4Factor,
      n2oFactor: f.n2oFactor,
      co2eFactor: f.co2eFactor,
      factorUnit: f.factorUnit,
      source: f.source,
      biogenic: f.biogenic,
      uncertaintyPct: f.uncertaintyPct,
      versionId: latestVersionId,
    };

    if (!existing) {
      if (!flags.dryRun) {
        await prisma.$transaction(async (tx) => {
          const created = await tx.emissionFactor.create({
            data: {
              scope: f.scope,
              category: f.category,
              subcategory: f.subcategory,
              element: f.element,
              unit: f.unit,
              ...writeData,
            },
          });
          await tx.emissionFactorChange.create({
            data: {
              factorId: created.id,
              changedById: null,
              changedByEmail: IMPORTER_EMAIL,
              action: FactorChangeAction.IMPORTED,
              changes: buildCreationDiff(
                created as unknown as FactorSnapshot,
              ) as unknown as Prisma.InputJsonValue,
            },
          });
        });
      }
      counts.created++;
      continue;
    }

    // Never touch a factor a human has edited (any non-IMPORTED change row).
    const humanEdits = await prisma.emissionFactorChange.count({
      where: { factorId: existing.id, action: { not: FactorChangeAction.IMPORTED } },
    });
    if (humanEdits > 0) {
      counts.keptAdminEdited++;
      keptLines.push(`  row ${r}: KEPT (admin-edited) - ${f.element}`);
      continue;
    }

    const diff = buildFactorDiff(
      existing as unknown as FactorSnapshot,
      snapshotFromFactor(f),
    );
    if (isEmptyDiff(diff)) {
      counts.unchanged++;
      continue;
    }

    if (!flags.dryRun) {
      await prisma.$transaction(async (tx) => {
        await tx.emissionFactor.update({ where: { id: existing.id }, data: writeData });
        await tx.emissionFactorChange.create({
          data: {
            factorId: existing.id,
            changedById: null,
            changedByEmail: IMPORTER_EMAIL,
            action: FactorChangeAction.IMPORTED,
            changes: diff as unknown as Prisma.InputJsonValue,
          },
        });
      });
    }
    counts.updated++;
  }

  // -------------------------------------------------------------------------
  // Starter cleanup: the seed inserted 12 representative factors whose source ends with
  // "(starter)". Remove them now that the real library is loaded, but never orphan an
  // activity entry, and always preserve the Scope-2 grid picker element.
  // -------------------------------------------------------------------------
  const starters = await prisma.emissionFactor.findMany({
    where: { source: { endsWith: STARTER_SUFFIX } },
  });
  for (const starter of starters) {
    if (starter.scope === Scope.SCOPE_2 || starter.element === GRID_PICKER_ELEMENT) {
      starterLines.push(`  PRESERVED (grid picker) - ${starter.element}`);
      continue;
    }
    const references = await prisma.activityEntry.count({
      where: { emissionFactorId: starter.id },
    });
    if (references === 0) {
      if (!flags.dryRun) {
        await prisma.emissionFactor.delete({ where: { id: starter.id } });
      }
      counts.starterDeleted++;
      starterLines.push(`  DELETED (0 entries) - ${starter.element}`);
    } else {
      if (!flags.dryRun) {
        await prisma.$transaction(async (tx) => {
          await tx.emissionFactor.update({
            where: { id: starter.id },
            data: { active: false },
          });
          await tx.emissionFactorChange.create({
            data: {
              factorId: starter.id,
              changedById: null,
              changedByEmail: IMPORTER_EMAIL,
              action: FactorChangeAction.DEACTIVATED,
              changes: buildFactorDiff(starter as unknown as FactorSnapshot, {
                active: false,
              }) as unknown as Prisma.InputJsonValue,
            },
          });
        });
      }
      counts.starterDeactivated++;
      starterLines.push(`  DEACTIVATED (${references} entries) - ${starter.element}`);
    }
  }

  // -------------------------------------------------------------------------
  // Report-only reconciliation: element names present in the stale 2024 sheet that have no
  // counterpart in the 2025 sheet (matched case-insensitively on element).
  // -------------------------------------------------------------------------
  const reconciliation = buildReconciliation(workbook, sheet);

  // -------------------------------------------------------------------------
  // Report. Every skip and every grid line is printed above the summary.
  // -------------------------------------------------------------------------
  printSection("Skipped rows (not imported)", skipLines);
  printSection("Scope 2 grid electricity - mismatches (WARN, never overwritten)", gridMismatchLines);
  printSection("Scope 2 grid electricity - years missing from the database", gridMissingLines);
  printSection("Scope 2 grid electricity - pending decision (RECs / self-generated)", gridPendingLines);
  printSection("Scope 2 grid electricity - matches", gridMatchLines);
  printSection("Factors kept (admin-edited, left untouched)", keptLines);
  printSection("Starter cleanup", starterLines);
  printSection(
    `Reconciliation: 2024 elements with no 2025 counterpart (${reconciliation.length})`,
    reconciliation.map((e) => `  ${e}`),
  );

  console.log("\n========== SUMMARY ==========");
  console.log(`  created:            ${counts.created}`);
  console.log(`  updated:            ${counts.updated}`);
  console.log(`  unchanged:          ${counts.unchanged}`);
  console.log(`  keptAdminEdited:    ${counts.keptAdminEdited}`);
  console.log(`  skippedNoFactor:    ${counts.skippedNoFactor}`);
  console.log(`  skippedAmbiguous:   ${counts.skippedAmbiguous}`);
  console.log(`  skippedIncomplete:  ${counts.skippedIncomplete}`);
  console.log(`  skippedBadScope:    ${counts.skippedBadScope}`);
  console.log(`  skippedDuplicate:   ${counts.skippedDuplicate}`);
  console.log(`  skippedScope2:      ${counts.skippedScope2}`);
  console.log(`  starterDeleted:     ${counts.starterDeleted}`);
  console.log(`  starterDeactivated: ${counts.starterDeactivated}`);
  console.log(
    `  grid: ${gridMatchLines.length} ok, ${gridMismatchLines.length} mismatch, ` +
      `${gridMissingLines.length} missing, ${gridPendingLines.length} pending`,
  );
  console.log("=============================");
  if (flags.dryRun) console.log("DRY RUN: no changes were written.");
}

function printSection(title: string, lines: string[]) {
  console.log(`\n--- ${title}: ${lines.length} ---`);
  for (const line of lines) console.log(line);
}

// Distinct, case-insensitive element names from the old 2024 "Factores de emision" sheet that
// do not appear in the 2025 sheet. Report-only: that sheet is never imported.
function buildReconciliation(
  workbook: ExcelJS.Workbook,
  newSheet: ExcelJS.Worksheet,
): string[] {
  const oldSheet = workbook.worksheets.find((ws) => ws.name === "Factores de emisión");
  if (!oldSheet) return [];

  const norm = (raw: unknown) => cellText(raw).replace(/\s+/g, " ").trim();

  const newElements = new Set<string>();
  for (let r = 3; r <= newSheet.rowCount; r++) {
    const element = norm(newSheet.getRow(r).getCell(4).value);
    if (element) newElements.add(element.toLowerCase());
  }

  const missing: string[] = [];
  const seen = new Set<string>();
  for (let r = 3; r <= oldSheet.rowCount; r++) {
    const element = norm(oldSheet.getRow(r).getCell(4).value);
    if (!element) continue;
    const lower = element.toLowerCase();
    if (newElements.has(lower) || seen.has(lower)) continue;
    seen.add(lower);
    missing.push(element);
  }
  return missing;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
