// Excel emission-factor importer.
//
//   bun prisma/import-factors.ts [--dry-run] [--file <path>] [--apply-grid]
//                                [--deactivate-leftovers]
//
// An unrecognized argument is refused rather than ignored: `--dryrun` used to parse as nothing
// at all, so the run wrote while its author believed it was a rehearsal.
//
// Reads the authoritative per-gas table of CECODES's factor workbook and reconciles it into
// emission_factors. Two sheets qualify, with an identical column layout: "Jerarquia nueva
// (2025)" in the original library workbook, and "Emission Factors" in the DASHBOARD workbook
// CECODES sent 2026-07-24 ("the important pages are PRINCIPAL, Emission Factors and
// DASHBOARD"). It is idempotent and it never clobbers a human edit: a factor that carries any
// EmissionFactorChange whose action is not IMPORTED is left untouched. A second consecutive
// run reports everything as unchanged.
//
// What it deliberately does NOT do:
//   - It never inserts the Scope-2 "UPME <year>" rows as emission_factors. Grid electricity is
//     modelled as one picker element plus grid_electricity_factors keyed by year, so those rows
//     are only COMPARED against that table and reported. Without --apply-grid a grid factor is
//     never overwritten; WITH it, the sheet's per-year series is written to
//     grid_electricity_factors (CECODES 2026-07-24, answer 4: "use dashboard excel table as
//     reference"), creating missing years and correcting mismatched ones.
//   - It never reads column 15 or 21 (the sheet's cached kg formula results). CH4 and N2O come
//     from the gram columns 14 and 20, divided by 1000 with Decimal. A consequence: rows that
//     express CH4/N2O only in the kg columns map to no-factor and are reported, not imported.
//   - It never hard-deletes a factor that has activity entries: it deactivates it instead.
//
// What it derives rather than reads: entryMode and fuelType are computed from the row's unit,
// subcategory and element (src/lib/factor-import/derive-modes.ts and src/lib/calc/fuel.ts) and
// written on every run, so a renamed factor cannot come back as a plain QUANTITY. An UPDATE
// never lowers a mode that is already richer than QUANTITY: see the derivation in main().
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
  type EntryMode,
  type FuelType,
} from "../src/lib/generated/prisma/client";
import {
  buildCreationDiff,
  buildFactorDiff,
  isEmptyDiff,
  type FactorSnapshot,
} from "../src/features/admin/lib/factor-diff";
import { mapRow, cellText, type RawRowCells } from "../src/lib/factor-import/map-row";
import { deriveEntryMode } from "../src/lib/factor-import/derive-modes";
import { deriveFuelType } from "../src/lib/calc/fuel";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const REFERENCE_DIR = path.join(process.cwd(), "docs", "reference");
const IMPORTER_EMAIL = "importador";
// The Scope-2 element the data-entry source picker depends on. Never removed by cleanup.
const GRID_PICKER_ELEMENT = "SISTEMA INTERCONECTADO NACIONAL - SIN";
const STARTER_SUFFIX = "(starter)";

const USAGE =
  "usage: bun prisma/import-factors.ts [--dry-run] [--file <path.xlsx>] [--apply-grid] " +
  "[--deactivate-leftovers]";

type Flags = {
  dryRun: boolean;
  file: string | null;
  applyGrid: boolean;
  deactivateLeftovers: boolean;
};

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    dryRun: false,
    file: null,
    applyGrid: false,
    deactivateLeftovers: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--apply-grid") flags.applyGrid = true;
    else if (arg === "--deactivate-leftovers") flags.deactivateLeftovers = true;
    else if (arg === "--file") {
      // A bare `--file`, or `--file --dry-run`, used to fall through to null, and the run then
      // silently imported the workbook in docs/reference instead of the one that was asked for.
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("--file needs a path, e.g. --file docs/sample-data/DASHBOARD.xlsx");
      }
      flags.file = value;
    } else if (arg.startsWith("--")) {
      // A typo like --dryrun was ignored, which means the run WROTE while its author believed
      // they were rehearsing. Nothing here is worth guessing at.
      throw new Error(`Unknown flag: ${arg}\n${USAGE}`);
    } else {
      throw new Error(`Unexpected argument: ${arg}\n${USAGE}`);
    }
  }
  return flags;
}

// The single .xlsx in docs/reference. Its real name contains an accented "emision", so it is
// resolved by extension rather than by a hardcoded name.
function resolveWorkbookPath(override: string | null): string {
  if (override) {
    // Resolved against the caller's cwd, then checked here rather than left to exceljs: a
    // mistyped path surfaced as a raw ENOENT from deep inside the library, and a wrong-format
    // file as an unrelated zip error, neither of which names the flag that caused it.
    const resolved = path.resolve(process.cwd(), override);
    if (!fs.existsSync(resolved)) throw new Error(`Workbook not found: ${resolved}`);
    if (!resolved.toLowerCase().endsWith(".xlsx")) {
      throw new Error(`Not an .xlsx workbook: ${resolved}`);
    }
    return resolved;
  }
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
  gasType: string | null;
  factorUnit: string | null;
  source: string | null;
  biogenic: boolean;
  uncertaintyPct: string | null;
  // The two derived columns, passed in rather than read off the mapped row: on an update they
  // may be the stored value the derivation declined to overwrite, and the diff has to record
  // what is actually written.
  entryMode: EntryMode;
  fuelType: FuelType | null;
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
    gasType: f.gasType,
    factorUnit: f.factorUnit,
    source: f.source,
    biogenic: f.biogenic,
    uncertaintyPct: f.uncertaintyPct,
    entryMode: f.entryMode,
    fuelType: f.fuelType,
  };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const workbookPath = resolveWorkbookPath(flags.file);

  console.log(`Emission-factor importer${flags.dryRun ? " (DRY RUN, no writes)" : ""}`);
  console.log(`Workbook: ${workbookPath}\n`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);

  // The original library workbook calls the table "Jerarquia nueva (2025)"; the DASHBOARD
  // workbook (2026-07-24) calls the same table "Emission Factors". Same columns, same rows.
  const sheet = workbook.worksheets.find(
    (ws) => ws.name.startsWith("Jerarqu") || ws.name === "Emission Factors",
  );
  if (!sheet) {
    throw new Error(
      'Neither a sheet starting with "Jerarqu" nor one named "Emission Factors" was found.',
    );
  }

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
    gridCreated: 0,
    gridUpdated: 0,
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
        if (flags.applyGrid) {
          if (!flags.dryRun) {
            await prisma.gridElectricityFactor.create({
              data: {
                year,
                factor: new Prisma.Decimal(value),
                source: f.source ?? "UPME",
                updatedByEmail: IMPORTER_EMAIL,
              },
            });
          }
          counts.gridCreated++;
          gridMissingLines.push(`  row ${r}: GRID CREATED year ${year} = ${value}`);
        } else {
          gridMissingLines.push(
            `  row ${r}: GRID MISSING year ${year} (Excel ${value}) not in database`,
          );
        }
      } else if (!new Prisma.Decimal(value).eq(grid.factor)) {
        if (flags.applyGrid) {
          if (!flags.dryRun) {
            await prisma.gridElectricityFactor.update({
              where: { year },
              data: {
                factor: new Prisma.Decimal(value),
                source: f.source ?? grid.source,
                updatedByEmail: IMPORTER_EMAIL,
              },
            });
          }
          counts.gridUpdated++;
          gridMismatchLines.push(
            `  row ${r}: GRID UPDATED year ${year}: ${grid.factor.toString()} -> ${value}`,
          );
        } else {
          gridMismatchLines.push(
            `  row ${r}: GRID WARN year ${year}: Excel ${value} vs database ${grid.factor.toString()} (not overwritten)`,
          );
        }
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

    if (!existing) {
      // The natural key includes subcategory, so an admin correction that regrouped a factor
      // into a different subcategory (e.g. fixing the HCFC-22/R-22 and Propano/R-290 grouping
      // bug, 2026-08-15) makes the ALREADY-CORRECTED row invisible to this lookup: the workbook
      // still has the old subcategory for that element, so without this check the importer would
      // insert a brand-new duplicate under the old, wrong grouping every time it re-runs against
      // an unmodified workbook - which is exactly what happened once (see
      // prisma/fix-2026-08-15-refrigerant-duplicate-regression.ts). Before creating anything,
      // check whether an admin-edited factor already exists for this element under scope +
      // category + unit, regardless of its current subcategory. If so, this is that same element
      // reappearing under a stale workbook grouping - skip it exactly like the exact-match
      // "never touch a human-edited factor" rule below, rather than creating a duplicate.
      const editedSibling = await prisma.emissionFactor.findFirst({
        where: {
          scope: f.scope,
          category: f.category,
          element: f.element,
          unit: f.unit,
          changes: { some: { action: { not: FactorChangeAction.IMPORTED } } },
        },
      });
      if (editedSibling) {
        counts.keptAdminEdited++;
        keptLines.push(
          `  row ${r}: KEPT (admin-edited, moved to subcategory "${editedSibling.subcategory ?? ""}") - ${f.element}`,
        );
        continue;
      }
    }

    // Both derived columns are written on EVERY run. Without them a created factor takes the
    // column default, QUANTITY, so a renamed "pasajeros * km" row comes back asking for one
    // pre-multiplied number instead of a count and a distance, with nothing to say it changed.
    const derivedEntryMode = deriveEntryMode({ unit: f.unit, subcategory: f.subcategory });
    // On an UPDATE the derivation may raise a mode but never lower one. The modes set by
    // migrations 20260815120000 and 20260903120200 leave no EmissionFactorChange row, so the
    // "never touch a human-edited factor" guard above does not cover them: a workbook revision
    // that dropped the accent from "vehículo * km" would otherwise quietly undo the backfill.
    const entryMode: EntryMode =
      existing && derivedEntryMode === "QUANTITY" && existing.entryMode !== "QUANTITY"
        ? existing.entryMode
        : derivedEntryMode;
    // Derived from the mode that is actually being written, so a kept MONEY_PER_GALLON still
    // gets its fuel. The stored value is the fallback for the same reason as above (the
    // 20260903120100 backfill left no change row), but only while the mode still calls for one:
    // a fuelType outliving its mode would be a stale column nothing reads.
    const fuelType: FuelType | null =
      entryMode === "MONEY_PER_GALLON"
        ? (deriveFuelType({ entryMode, element: f.element }) ?? existing?.fuelType ?? null)
        : null;

    const writeData = {
      co2Factor: f.co2Factor,
      ch4Factor: f.ch4Factor,
      n2oFactor: f.n2oFactor,
      co2eFactor: f.co2eFactor,
      gasType: f.gasType,
      factorUnit: f.factorUnit,
      source: f.source,
      biogenic: f.biogenic,
      uncertaintyPct: f.uncertaintyPct,
      entryMode,
      fuelType,
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
      snapshotFromFactor({ ...f, entryMode, fuelType }),
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
  // active: true, or every run would re-deactivate the same referenced starter and append a
  // duplicate DEACTIVATED audit row each time (observed on the 2026-07-25 double apply).
  const starters = await prisma.emissionFactor.findMany({
    where: { source: { endsWith: STARTER_SUFFIX }, active: true },
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
  // Report-only: ACTIVE database factors whose natural key does not appear in this sheet.
  // The importer never deletes them (an entry may reference them, and absence from one
  // workbook revision is not an instruction). A non-empty list is something to show CECODES,
  // not something to act on silently. Scope 2 and starters are excluded: the grid picker and
  // the UPME rows are app-managed, and starters have their own cleanup above.
  // -------------------------------------------------------------------------
  // With --deactivate-leftovers (client 2026-07-24, answer 4: this sheet is the reference), an
  // unreferenced leftover is deactivated, with a DEACTIVATED audit row, so the picker stops
  // offering the stale spelling next to its renamed successor. Reversible from the admin UI.
  // A leftover that activity entries reference is only reported: deactivating it would strand
  // real data behind an inactive factor, and that is a human's call.
  const leftoverLines: string[] = [];
  let leftoverDeactivated = 0;
  const activeFactors = await prisma.emissionFactor.findMany({
    where: {
      active: true,
      scope: { not: Scope.SCOPE_2 },
      NOT: { source: { endsWith: STARTER_SUFFIX } },
    },
  });
  for (const f of activeFactors) {
    const key = [f.scope, f.category, f.subcategory ?? "", f.element, f.unit].join("|");
    if (seenKeys.has(key)) continue;

    if (!flags.deactivateLeftovers) {
      leftoverLines.push(`  ${f.scope} / ${f.category} / ${f.element} (${f.unit})`);
      continue;
    }

    const references = await prisma.activityEntry.count({
      where: { emissionFactorId: f.id },
    });
    if (references > 0) {
      leftoverLines.push(
        `  KEPT (${references} entries) - ${f.scope} / ${f.category} / ${f.element} (${f.unit})`,
      );
      continue;
    }

    if (!flags.dryRun) {
      await prisma.$transaction(async (tx) => {
        await tx.emissionFactor.update({ where: { id: f.id }, data: { active: false } });
        await tx.emissionFactorChange.create({
          data: {
            factorId: f.id,
            changedById: null,
            changedByEmail: IMPORTER_EMAIL,
            action: FactorChangeAction.DEACTIVATED,
            changes: buildFactorDiff(f as unknown as FactorSnapshot, {
              active: false,
            }) as unknown as Prisma.InputJsonValue,
          },
        });
      });
    }
    leftoverDeactivated++;
    leftoverLines.push(
      `  DEACTIVATED (not in sheet, 0 entries) - ${f.scope} / ${f.category} / ${f.element} (${f.unit})`,
    );
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
  printSection("Active database factors NOT in this sheet (kept, report-only)", leftoverLines);
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
      `${gridMissingLines.length} missing, ${gridPendingLines.length} pending` +
      (flags.applyGrid
        ? ` (applied: ${counts.gridCreated} created, ${counts.gridUpdated} updated)`
        : ""),
  );
  console.log(
    `  leftoverInDb:       ${leftoverLines.length}` +
      (flags.deactivateLeftovers ? ` (deactivated: ${leftoverDeactivated})` : ""),
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
