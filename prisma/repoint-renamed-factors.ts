// Moves the ActivityEntry rows of a RENAMED emission factor onto the row the importer created
// for the new name.
//
//   bun prisma/repoint-renamed-factors.ts            # dry run: prints the candidates and the plan
//   bun prisma/repoint-renamed-factors.ts --apply    # writes
//
// import-factors.ts matches a workbook row to a database row by the natural key
// (scope, category, subcategory, element, unit). When CECODES renames an element, that key stops
// matching anything, so the importer CREATES a second row under the new name while every
// ActivityEntry stays bound to the old one. The library then holds two rows for one real source:
// the new row, carrying the corrected values that nobody's data points at, and the old row, which
// carries the data and the stale values. That is not hypothetical: it is exactly how the km/mile
// travel correction (prisma/fix-travel-factors.ts) stopped reaching real entries.
//
// NOTHING IS MOVED AUTOMATICALLY. Deciding that two differently named rows are the same source is
// a human judgement, and getting it wrong re-prices a tenant's reported emissions against a factor
// they never chose. A run therefore always PRINTS the candidate pairs it can see, and acts only on
// the ones an operator has verified and copied into PAIRS below.
//
// The stale row is deactivated, never deleted: an inactive factor keeps its history and its
// foreign keys, and an admin can reverse a deactivation in one click. It is only deactivated when
// every one of its entries actually moved; a row that still holds data stays active, or the data
// would be stranded behind a source the picker no longer offers.

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  FactorChangeAction,
  type EntryMode,
  type FuelType,
  type Prisma,
  type Scope,
} from "@/lib/generated/prisma/client";
import { datasourceUrl } from "../scripts/datasource";

const adapter = new PrismaPg({ connectionString: datasourceUrl() });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");

// The marker that makes this script traceable in the audit trail, on both the factor history and
// the tenant data-entry log.
const CHANGED_BY = "repunte-factores-2026-09-03";

type Pair = {
  /** The row the entries are on today: the old name. */
  staleId: string;
  /** The row they belong on: the name the workbook now uses. */
  currentId: string;
  /** Why these two are the same source. Written down so the audit is reviewable a year later. */
  why: string;
};

// EMPTY ON PURPOSE. Run the script with no arguments, read the CANDIDATE list it prints, verify
// each pair by hand (open both factors in /admin/factors and compare), then paste the ready-made
// lines it prints for the ones you have confirmed. Anything not listed here is never touched.
const PAIRS: Pair[] = [];

type FactorRow = {
  id: string;
  scope: Scope;
  category: string;
  subcategory: string | null;
  element: string;
  unit: string;
  entryMode: EntryMode;
  fuelType: FuelType | null;
  active: boolean;
};

type EntryRow = {
  id: string;
  reportingYearId: string;
  companyId: string;
  scope: Scope;
  // The labels the entry snapshotted at entry time. They move with the row when it is re-pointed,
  // because rollupYear groups by these columns and not by the factor's.
  category: string;
  subcategory: string | null;
  element: string;
  unit: string;
  month: number | null;
  value: Prisma.Decimal | null;
  reportingYear: { year: number; facility: { name: string | null } };
};

type MovePlan = {
  pair: Pair;
  stale: FactorRow;
  current: FactorRow;
  movable: EntryRow[];
  /** Entries whose slot on the target is already taken. Reported and left where they are. */
  conflicts: EntryRow[];
  factorData: { entryMode?: EntryMode; fuelType?: FuelType };
  factorChanges: Record<string, { from: string | null; to: string | null }>;
  deactivateStale: boolean;
};

// activity_entries is uniquely keyed on (reportingYearId, emissionFactorId, month), plus a partial
// unique index on (reportingYearId, emissionFactorId) WHERE month IS NULL for the annual rows. So
// a slot is a year plus a month, with the annual rows sharing one slot per year.
function slotKey(reportingYearId: string, month: number | null): string {
  return `${reportingYearId}|${month ?? "annual"}`;
}

function describeEntry(entry: EntryRow): string {
  const where = entry.reportingYear.facility.name ?? "(unnamed sede)";
  const when = entry.month === null ? "annual" : `month ${entry.month}`;
  return `${entry.reportingYear.year} ${where} (${when}) = ${entry.value?.toString() ?? "not reported"}`;
}

async function main() {
  console.log(APPLY ? "APPLYING" : "DRY RUN (nothing will be written; pass --apply to write)");

  await printCandidates();

  if (PAIRS.length === 0) {
    console.log(
      "\nPAIRS is empty, so nothing is moved. Verify the candidates above and paste the ones " +
        "you confirmed into PAIRS at the top of this file, then re-run.",
    );
    return;
  }

  console.log(`\n--- Plan for ${PAIRS.length} confirmed pair(s) ---`);

  const plans: MovePlan[] = [];
  for (const pair of PAIRS) {
    const plan = await planPair(pair);
    if (plan) plans.push(plan);
  }

  let movedEntries = 0;
  let skippedEntries = 0;
  for (const plan of plans) {
    if (APPLY) await applyPlan(plan);
    movedEntries += plan.movable.length;
    skippedEntries += plan.conflicts.length;
  }

  console.log(
    `\n${APPLY ? "Moved" : "Would move"} ${movedEntries} entr${movedEntries === 1 ? "y" : "ies"} ` +
      `across ${plans.length} pair(s); left ${skippedEntries} in place because the target slot is taken.`,
  );
  if (!APPLY && plans.length > 0) {
    console.log("Re-run with --apply to write. Every move lands in the tenant audit trail.");
  }
}

// ---------------------------------------------------------------------------
// 1. Candidates. Printed, never acted on.
// ---------------------------------------------------------------------------

// A rename leaves two ACTIVE rows sharing (scope, category, unit), one holding every entry and one
// holding none, whose element names still read as the same thing (or whose element is identical
// and only the subcategory moved, which is the regrouping shape). Requiring that asymmetry and
// that similarity is what keeps this list short enough to read: without them, every refrigerant in
// a "kg" group pairs with every other one.
async function printCandidates() {
  const factors = await prisma.emissionFactor.findMany({
    where: { active: true },
    select: {
      id: true,
      scope: true,
      category: true,
      subcategory: true,
      element: true,
      unit: true,
      createdAt: true,
      _count: { select: { entries: true } },
    },
    orderBy: [{ scope: "asc" }, { category: "asc" }, { unit: "asc" }, { element: "asc" }],
  });

  type Candidate = (typeof factors)[number];
  const groups = new Map<string, Candidate[]>();
  for (const factor of factors) {
    const key = `${factor.scope}|${factor.category}|${factor.unit}`;
    const group = groups.get(key);
    if (group) group.push(factor);
    else groups.set(key, [factor]);
  }

  const lines: string[] = [];
  let candidates = 0;
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if ((a._count.entries > 0) === (b._count.entries > 0)) continue;
        const regrouped = a.element === b.element;
        if (!regrouped && !similarElements(a.element, b.element)) continue;

        const stale = a._count.entries > 0 ? a : b;
        const current = stale === a ? b : a;
        lines.push(
          `  CANDIDATE  ${stale.scope} / ${stale.category} / ${stale.unit}` +
            `${regrouped ? " (same element, regrouped)" : ""}`,
          `    stale    entries=${stale._count.entries.toString().padStart(3)}  ` +
            `"${stale.element}"  subcategoria="${stale.subcategory ?? ""}"  ` +
            `id=${stale.id}  creado=${stale.createdAt.toISOString().slice(0, 10)}`,
          `    current  entries=${current._count.entries.toString().padStart(3)}  ` +
            `"${current.element}"  subcategoria="${current.subcategory ?? ""}"  ` +
            `id=${current.id}  creado=${current.createdAt.toISOString().slice(0, 10)}`,
          `    { staleId: "${stale.id}", currentId: "${current.id}", why: "" },`,
        );
        candidates += 1;
      }
    }
  }

  console.log(`\n--- Candidate pairs (verify by hand, nothing here is acted on): ${candidates} ---`);
  for (const line of lines) console.log(line);
}

// The accents the factor library actually uses. Spelled out rather than stripped through NFD so
// this file stays readable; anything else non-alphanumeric collapses to a space below anyway.
const ACCENTS: Record<string, string> = {
  á: "a",
  é: "e",
  í: "i",
  ó: "o",
  ú: "u",
  ü: "u",
  ñ: "n",
};

function normalizeName(text: string): string {
  return text
    .toLowerCase()
    .replace(/[áéíóúüñ]/g, (letter) => ACCENTS[letter] ?? letter)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function significantWords(text: string): Set<string> {
  return new Set(normalizeName(text).split(" ").filter((word) => word.length > 2));
}

// Accent- and punctuation-insensitive comparison of two element names. A rename usually keeps most
// of the words ("Electricidad (Sistema Interconectado Nacional - SIN)" vs "SISTEMA INTERCONECTADO
// NACIONAL - SIN"), so containment or a half-shared vocabulary is enough to make a pair worth a
// look. This only decides what gets PRINTED; the operator decides what gets moved.
function similarElements(a: string, b: string): boolean {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;

  const leftWords = significantWords(a);
  const rightWords = significantWords(b);
  if (leftWords.size === 0 || rightWords.size === 0) return false;
  let shared = 0;
  for (const word of leftWords) if (rightWords.has(word)) shared += 1;
  return shared / Math.min(leftWords.size, rightWords.size) >= 0.5;
}

// ---------------------------------------------------------------------------
// 2. The plan for one confirmed pair.
// ---------------------------------------------------------------------------

async function planPair(pair: Pair): Promise<MovePlan | null> {
  if (pair.staleId === pair.currentId) {
    console.log(`  REFUSE  staleId and currentId are the same row (${pair.staleId}).`);
    return null;
  }

  const stale = await loadFactor(pair.staleId);
  const current = await loadFactor(pair.currentId);
  if (!stale || !current) {
    console.log(
      `  REFUSE  factor not found: ${!stale ? pair.staleId : pair.currentId}. Nothing moved for this pair.`,
    );
    return null;
  }

  // Scope decides which total the number lands in and unit decides what the number MEANS, so a
  // mismatch is never a rename, it is a mistyped id. Category and subcategory are allowed to
  // differ: a regrouping is one of the shapes this script exists for.
  if (stale.scope !== current.scope || stale.unit !== current.unit) {
    console.log(
      `  REFUSE  ${stale.scope}/${stale.unit} -> ${current.scope}/${current.unit}: scope and unit ` +
        "must match, or the moved entries would mean something else. Nothing moved for this pair.",
    );
    return null;
  }

  const entries = await prisma.activityEntry.findMany({
    where: { emissionFactorId: stale.id },
    select: {
      id: true,
      reportingYearId: true,
      companyId: true,
      scope: true,
      // The denormalized labels the entry snapshotted. They move with the row, so the audit can
      // record what each one was before.
      category: true,
      subcategory: true,
      element: true,
      unit: true,
      month: true,
      value: true,
      reportingYear: { select: { year: true, facility: { select: { name: true } } } },
    },
    orderBy: [{ reportingYearId: "asc" }, { month: "asc" }],
  });

  const takenSlots = new Set(
    (
      await prisma.activityEntry.findMany({
        where: { emissionFactorId: current.id },
        select: { reportingYearId: true, month: true },
      })
    ).map((entry) => slotKey(entry.reportingYearId, entry.month)),
  );

  const movable: EntryRow[] = [];
  const conflicts: EntryRow[] = [];
  for (const entry of entries) {
    if (takenSlots.has(slotKey(entry.reportingYearId, entry.month))) conflicts.push(entry);
    else movable.push(entry);
  }

  // Idempotency: a pair already moved has nothing left to move, and re-running must not append a
  // second audit row. A pair whose conflicts were resolved by hand since the last run DOES have
  // entries left, so it is planned again on purpose.
  const alreadyRepointed = await prisma.emissionFactorChange.count({
    where: { factorId: current.id, changedByEmail: CHANGED_BY },
  });
  if (alreadyRepointed > 0 && movable.length === 0) {
    console.log(`\n  SKIP (already re-pointed)  "${stale.element}" -> "${current.element}"`);
    return null;
  }

  // Never downgrade a mode or a fuel someone deliberately set: only fill what the target is
  // missing. The stale row carries whatever the 20260815120000 backfill or an admin put there;
  // the row the importer created may still be at the QUANTITY default.
  const factorData: MovePlan["factorData"] = {};
  const factorChanges: MovePlan["factorChanges"] = {};
  if (current.entryMode === "QUANTITY" && stale.entryMode !== "QUANTITY") {
    factorData.entryMode = stale.entryMode;
    factorChanges.entryMode = { from: current.entryMode, to: stale.entryMode };
  }
  if (current.fuelType === null && stale.fuelType !== null) {
    factorData.fuelType = stale.fuelType;
    factorChanges.fuelType = { from: null, to: stale.fuelType };
  }
  factorChanges.repointedFrom = {
    from: `${stale.element} [${stale.id}]`,
    to: `${current.element} [${current.id}]`,
  };
  factorChanges.repointedEntries = { from: null, to: String(movable.length) };

  const deactivateStale = stale.active && conflicts.length === 0;

  console.log(`\n  PAIR  "${stale.element}" -> "${current.element}"`);
  console.log(`        why: ${pair.why || "(not recorded)"}`);
  console.log(
    `        MOVE ${movable.length} entr${movable.length === 1 ? "y" : "ies"} from ${stale.id} to ${current.id}`,
  );
  for (const entry of movable) console.log(`          move      ${describeEntry(entry)}`);
  for (const entry of conflicts) {
    console.log(
      `          CONFLICT  ${describeEntry(entry)} - the target already has that year and month, ` +
        "so the move would collide with the unique key. Left on the old factor.",
    );
  }
  for (const [field, change] of Object.entries(factorChanges)) {
    console.log(`        ${field}: ${change.from ?? "-"} -> ${change.to ?? "-"}`);
  }
  console.log(
    deactivateStale
      ? "        DEACTIVATE the old row (it will hold no entries)"
      : `        keep the old row ACTIVE (${conflicts.length} entr${conflicts.length === 1 ? "y" : "ies"} stay on it)`,
  );
  if (movable.length > 0) {
    console.log(
      `        note: the moved entries keep the element label they were entered under ` +
        `("${movable[0].element}"). ActivityEntry snapshots its labels on purpose, so a rename ` +
        "does not rewrite what a user saw when they typed the number.",
    );
  }

  return { pair, stale, current, movable, conflicts, factorData, factorChanges, deactivateStale };
}

async function loadFactor(id: string): Promise<FactorRow | null> {
  return prisma.emissionFactor.findUnique({
    where: { id },
    select: {
      id: true,
      scope: true,
      category: true,
      subcategory: true,
      element: true,
      unit: true,
      entryMode: true,
      fuelType: true,
      active: true,
    },
  });
}

// ---------------------------------------------------------------------------
// 3. The write. One transaction per pair, so a surprise rolls the whole pair back.
// ---------------------------------------------------------------------------

async function applyPlan(plan: MovePlan) {
  const { stale, current, movable } = plan;

  await prisma.$transaction(async (tx) => {
    if (movable.length > 0) {
      // updateMany reports { count } instead of throwing, so a row that moved out from under this
      // run (or an emissionFactorId that no longer matches) would otherwise pass silently.
      // The snapshotted labels move WITH the entry, not just the foreign key.
      //
      // activity_entries denormalizes scope/category/subcategory/element/unit at entry time so a
      // row stays legible after its factor is renamed or removed, and rollupYear groups by THOSE
      // columns, not by the factor's. Leaving them behind would price the entry from the corrected
      // factor (which is the point of this script) while still filing it under the old element and
      // the old subcategory on the dashboard, the Pareto and the ISO declaration. Since a listed
      // pair asserts these two rows are the same source, the current factor's labels are the
      // correct ones; the from -> to for each is recorded in the audit row below.
      const moved = await tx.activityEntry.updateMany({
        where: { id: { in: movable.map((entry) => entry.id) }, emissionFactorId: stale.id },
        data: {
          emissionFactorId: current.id,
          scope: current.scope,
          category: current.category,
          subcategory: current.subcategory,
          element: current.element,
          unit: current.unit,
        },
      });
      if (moved.count !== movable.length) {
        throw new Error(
          `Refusing: expected to move ${movable.length} entr(y/ies) from ${stale.id}, but ` +
            `updateMany reported ${moved.count}. The transaction is rolled back; re-run the dry ` +
            "run and look at what changed underneath it.",
        );
      }

      // The tenant-facing audit. EntryChangeAction has no "re-pointed" member and adding one is a
      // migration, so this uses the structural action closest in meaning; the changes JSON carries
      // what actually happened, and the element is the one the user entered against.
      await tx.activityEntryChange.createMany({
        data: movable.map((entry) => ({
          reportingYearId: entry.reportingYearId,
          companyId: entry.companyId,
          emissionFactorId: current.id,
          scope: entry.scope,
          element: entry.element,
          month: entry.month,
          changedByEmail: CHANGED_BY,
          action: "SOURCE_ADDED" as const,
          changes: {
            emissionFactorId: { from: stale.id, to: current.id },
            element: { from: entry.element, to: current.element },
            category: { from: entry.category, to: current.category },
            subcategory: { from: entry.subcategory, to: current.subcategory },
            unit: { from: entry.unit, to: current.unit },
          },
        })),
      });
    }

    if (Object.keys(plan.factorData).length > 0) {
      await tx.emissionFactor.update({ where: { id: current.id }, data: plan.factorData });
    }

    // FactorHistory renders only the fields in FACTOR_FIELDS, so entryMode, fuelType and the
    // re-point keys are stored for the record rather than drawn; the row itself still shows as an
    // UPDATED change made by this script's marker.
    await tx.emissionFactorChange.create({
      data: {
        factorId: current.id,
        changedById: null,
        changedByEmail: CHANGED_BY,
        action: FactorChangeAction.UPDATED,
        changes: plan.factorChanges as Prisma.InputJsonValue,
      },
    });

    // The old row leaves the picker with its own audit row, exactly as import-factors.ts's starter
    // and leftover cleanups do. "true"/"false" is how factor-diff's toComparable serializes a
    // boolean, so the history renders this line like any hand edit.
    if (plan.deactivateStale) {
      await tx.emissionFactor.update({ where: { id: stale.id }, data: { active: false } });
      await tx.emissionFactorChange.create({
        data: {
          factorId: stale.id,
          changedById: null,
          changedByEmail: CHANGED_BY,
          action: FactorChangeAction.DEACTIVATED,
          changes: { active: { from: "true", to: "false" } },
        },
      });
    }
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
