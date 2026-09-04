/**
 * Applies scripts/bootstrap-db.sql on its own, outside a full initialization.
 *
 *   bun run db:bootstrap
 *
 * The same step scripts/init-db.ts performs between waiting for the database and running
 * `prisma migrate deploy`, and it exists separately because an operator sometimes needs just that
 * step: a database restored from a dump, or one created by hand, needs the objects the migration
 * chain still expects from the hosted auth provider that used to own it before `migrate deploy`
 * will run at all. The SQL is idempotent and guarded per object; see scripts/bootstrap-db.sql.
 *
 * This was an inline `bun -e "..."` in package.json until the datasource fix landed. A `-e` script
 * cannot import anything, so it could not be given the guard: it resolved `DIRECT_URL ??
 * DATABASE_URL` for itself, and so `DATABASE_URL=<throwaway> bun run db:bootstrap` still ran
 * against whatever DIRECT_URL .env.local supplies, which is the shared production database. Being
 * a real file is what lets it import scripts/datasource.ts.
 *
 * Behaviour is otherwise unchanged from that one-liner, deliberately: read the SQL, connect,
 * execute, disconnect, print "bootstrap ok", exit 0; exit non-zero on any failure. The only
 * addition is the `finally`, which closes the connection on the failure path too, matching
 * init-db.ts rather than the one-liner that simply let the process die holding a socket.
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { datasourceUrl } from "./datasource";

// Relative to the working directory, exactly as init-db.ts reads it, because both are run from
// the repository root (package.json scripts, and WORKDIR /app in the migrator image).
const SQL_PATH = "scripts/bootstrap-db.sql";

const client = new Client({ connectionString: datasourceUrl() });

try {
  await client.connect();
  await client.query(readFileSync(SQL_PATH, "utf8"));
  console.log("bootstrap ok");
} catch (error) {
  // Names the failure, never the connection string: this output gets pasted into chat windows.
  console.error(`bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
