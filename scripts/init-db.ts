/**
 * Database initialization, run once per deployment by the `init` container.
 *
 * Sequence: validate env -> wait for the database -> apply pending migrations -> seed reference
 * data and the admin. Any failure exits non-zero, which stops the app container from starting at
 * all (docker-compose.yml gates it on service_completed_successfully). A half-initialized system
 * that reports healthy is the outcome this file exists to prevent.
 *
 * Everything it does is idempotent and forward-only:
 *   - `prisma migrate deploy` applies only migrations absent from the _prisma_migrations ledger,
 *     and never re-runs, rewrites or rolls back one. It is not `migrate dev`; it creates no
 *     shadow database (Supabase's pooler has none) and never resets.
 *   - `prisma/seed.ts` guards every write three ways: createMany({skipDuplicates}) for grid
 *     factors, a findFirst existence check for factor versions, and upsert for the admin.
 *
 * It NEVER drops, truncates or deletes anything, and it never runs the demo seed - that is
 * prisma/seed-demo.ts, gated behind DEMO_SEED_ALLOWED, and it must never be set here.
 *
 * Logs name variables, never values: these lines get pasted into chat windows.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { INIT_ENV_KEYS, validateInitEnv } from "../src/lib/env";

const WAIT_ATTEMPTS = 30;
const WAIT_BASE_MS = 1000;
const WAIT_MAX_MS = 8000;

function log(message: string) {
  console.log(`[init] ${message}`);
}

function fail(message: string, detail?: unknown): never {
  console.error(`[init] FAILED: ${message}`);
  if (detail instanceof Error) console.error(`[init] ${detail.message}`);
  else if (detail) console.error(`[init] ${String(detail)}`);
  process.exit(1);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Waits for Postgres to accept connections. A container starting before its database is reachable
 * is normal, not exceptional - the network may not be up, or a managed database may be waking.
 * Crashing immediately would make the deployment depend on restart policies to eventually
 * succeed, which is the "start, crash, restart, hope" pattern this deployment is meant to avoid.
 */
async function waitForDatabase(connectionString: string) {
  for (let attempt = 1; attempt <= WAIT_ATTEMPTS; attempt++) {
    const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
    try {
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      log(`Database connection established (attempt ${attempt}).`);
      return;
    } catch (error) {
      await client.end().catch(() => {});
      if (attempt === WAIT_ATTEMPTS) {
        fail(
          `Database unreachable after ${WAIT_ATTEMPTS} attempts. ` +
            `Check DATABASE_URL host, port and credentials.`,
          error,
        );
      }
      const delay = Math.min(WAIT_BASE_MS * attempt, WAIT_MAX_MS);
      log(`Database not ready (attempt ${attempt}/${WAIT_ATTEMPTS}), retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
}

/** Runs a command with its output streamed straight through, so failures are readable. */
function run(label: string, command: string, args: string[]) {
  log(`${label}...`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) fail(`${label} could not start.`, result.error);
  if (result.status !== 0) fail(`${label} exited with code ${result.status}.`);
  log(`${label} completed.`);
}

async function main() {
  log("Starting database initialization.");

  // 1. Configuration. Fails before touching anything, naming only the variables at fault.
  try {
    validateInitEnv();
  } catch (error) {
    fail("Environment validation failed.", error);
  }
  const present = INIT_ENV_KEYS.filter((key) => Boolean(process.env[key]));
  log(`Configuration present: ${present.join(", ")}`);

  if (process.env.DEMO_SEED_ALLOWED === "true") {
    fail(
      "DEMO_SEED_ALLOWED=true is set. Demo data must never be seeded by an automated " +
        "deployment; unset it and run prisma/seed-demo.ts by hand if you really want it.",
    );
  }

  // 2. Reachability. Migrations use the DIRECT (unpooled) URL when one is set, matching
  //    prisma.config.ts, so that is the connection worth waiting on.
  const migrationUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!migrationUrl) fail("Neither DIRECT_URL nor DATABASE_URL is set.");
  log("Waiting for the database...");
  await waitForDatabase(migrationUrl);

  // 2b. Objects the migration chain needs that only Supabase supplies. Idempotent and guarded per
  //     object, so this is a no-op on a Supabase database and the reason a plain Postgres works at
  //     all. See scripts/bootstrap-db.sql for why migration 2 cannot simply be edited.
  log("Applying database bootstrap...");
  const bootstrapClient = new Client({ connectionString: migrationUrl });
  try {
    await bootstrapClient.connect();
    await bootstrapClient.query(readFileSync("scripts/bootstrap-db.sql", "utf8"));
    log("Database bootstrap completed.");
  } catch (error) {
    fail("Database bootstrap failed.", error);
  } finally {
    await bootstrapClient.end().catch(() => {});
  }

  // 3. Schema. Forward-only; applies just the pending migrations and prints which.
  run("Applying pending migrations", "bunx", ["prisma", "migrate", "deploy"]);

  // 4. Required system data + the admin account. Idempotent; safe on every restart.
  run("Seeding reference data and admin", "bun", ["prisma/seed.ts"]);

  log("Initialization complete. The application may start.");
}

main().catch((error) => fail("Unexpected error during initialization.", error));
