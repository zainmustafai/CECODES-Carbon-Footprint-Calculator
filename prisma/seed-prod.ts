// Idempotent production / reference seed.
//
//   bun prisma/seed-prod.ts            # DRY RUN: shows what would change, writes NOTHING
//   bun prisma/seed-prod.ts --apply    # writes, idempotently
//
// What it does, and only this:
//   1. Imports the real emission-factor library + its versions from the Excel in docs/reference.
//   2. Seeds the reference data and the single CECODES admin (grid factors, versions, admin).
//   3. Applies the travel-factor correction (the per-km fix) with a full audit trail.
//
// What it never does: it never seeds demo or E2E data, never seeds the placeholder "starter"
// factors, never touches a company / sede / user / activity row, and never resets or truncates.
// It is safe to run against the shared database while real, demo, and test data coexist, because
// it writes ONLY to emission_factors, emission_factor_versions, grid_electricity_factors, and the
// one admin row in app_users.
//
// Idempotent by construction, each underlying step converges:
//   - import: matches every row by its natural key, updates or inserts, never overwrites a human edit;
//   - reference seed: grid factors are create-only, versions are create-if-missing, admin is an upsert;
//   - travel correction: skips any factor already carrying the correction, so it corrects exactly once.
// Ordering matters: the import runs BEFORE the reference seed, so seed.ts's starter subset (which
// only seeds when the library is empty) never fires. Re-running makes no changes.
import { spawnSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Role } from "../src/lib/generated/prisma/client";

const APPLY = process.argv.includes("--apply");

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

// Run a sub-script, streaming its output. Each sub-script owns its own Prisma connection and its
// own dry-run support, so this stays a thin orchestrator over already-tested, idempotent pieces.
function run(label: string, cmd: string[]) {
  console.log(`\n──────── ${label} ────────`);
  const result = spawnSync("bun", cmd, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${label} failed (exit ${result.status ?? result.signal ?? "unknown"})`);
  }
}

// The reference tables must hold reference data only. A crashed E2E run can leak rows under the
// "E2E" prefix; this seed does not delete them (not its job), but it refuses to run silently over
// contamination so a human notices.
async function guardNoTestRows() {
  const factors = await prisma.emissionFactor.count({ where: { element: { startsWith: "E2E " } } });
  const versions = await prisma.emissionFactorVersion.count({
    where: { version: { startsWith: "E2E" } },
  });
  if (factors > 0 || versions > 0) {
    console.warn(
      `⚠  Found test rows in reference tables (E2E factors=${factors}, E2E versions=${versions}). ` +
        `These are not seeded here; clean them via the E2E teardown before trusting the counts.`,
    );
  }
}

async function report(stage: string) {
  const [ef, vv, gf, admins] = await Promise.all([
    prisma.emissionFactor.count(),
    prisma.emissionFactorVersion.count(),
    prisma.gridElectricityFactor.count(),
    prisma.appUser.count({ where: { role: Role.CECODES_ADMIN } }),
  ]);
  console.log(
    `\n${stage}:  emission factors=${ef}  versions=${vv}  grid years=${gf}  admins=${admins}`,
  );
}

async function main() {
  console.log(
    APPLY
      ? "PROD SEED — APPLYING (idempotent; re-running makes no changes)"
      : "PROD SEED — DRY RUN (writes nothing; pass --apply to write)",
  );

  await guardNoTestRows();

  if (APPLY) {
    // Import first, so the starter subset in seed.ts (guarded on an empty library) never runs.
    run("Factor library import", ["prisma/import-factors.ts"]);
    run("Reference data + admin (grid, versions, admin)", ["prisma/seed.ts"]);
    run("Travel-factor correction", ["prisma/fix-travel-factors.ts", "--apply"]);
    await report("After apply");
    console.log("\nDone. Run again to confirm it is a no-op (that is what idempotent means).");
  } else {
    run("Factor library import (dry run)", ["prisma/import-factors.ts", "--dry-run"]);
    run("Travel-factor correction (dry run)", ["prisma/fix-travel-factors.ts"]);
    await report("Current state (nothing written)");
    console.log("\nDry run complete. Nothing was written. Re-run with --apply to write.");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("\nPROD SEED FAILED:", e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
