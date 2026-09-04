/**
 * Proves a virgin Postgres can be initialized from nothing, twice.
 *
 * !!! THROWAWAY DATABASE ONLY !!! Never export DATABASE_URL/DIRECT_URL from .env.local for this
 * script, and never point it at any database holding real data. It applies the bootstrap, every
 * migration and the seed; it never drops or truncates anything, but a database that already
 * holds data will simply be migrated and seeded, which is not what this script is for.
 *
 *   docker run -d --name cecodes-verify -e POSTGRES_PASSWORD=verify -p 55432:5432 postgres:17-alpine
 *   DATABASE_URL=postgresql://postgres:verify@127.0.0.1:55432/postgres \
 *   DIRECT_URL=postgresql://postgres:verify@127.0.0.1:55432/postgres \
 *   ADMIN_EMAIL=verify@example.org ADMIN_PASSWORD=verify-password-1234 \
 *   bun scripts/verify-fresh-db.ts
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { datasourceUrl } from "./datasource";

// Resolved through scripts/datasource.ts rather than `DIRECT_URL ?? DATABASE_URL`, which is
// what made the warning above so easy to violate by accident: exporting only DATABASE_URL to
// name the throwaway container left .env.local's production DIRECT_URL in place, and `??`
// preferred it. Now the pair is one decision, and two halves naming two hosts throw.
const url = datasourceUrl();
if (!url) throw new Error("DIRECT_URL or DATABASE_URL must be set");

function run(label: string, command: string, args: string[]) {
  console.log(`[verify] ${label}...`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) throw new Error(`${label} exited with ${result.status}`);
}

async function bootstrap() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(readFileSync("scripts/bootstrap-db.sql", "utf8"));
  } finally {
    await client.end();
  }
}

async function pass(n: number) {
  console.log(`[verify] === pass ${n} ===`);
  await bootstrap();
  run("migrate deploy", "bunx", ["prisma", "migrate", "deploy"]);
  run("seed", "bun", ["prisma/seed.ts"]);
}

// Twice, because idempotency is the property under test. A bootstrap that works once and fails on
// a second container start would leave a deployment that cannot restart.
await pass(1);
await pass(2);

// The schema Prisma would generate must equal the schema the migrations produced. A non-empty
// diff means the migration chain and schema.prisma have drifted.
const diff = spawnSync(
  "bunx",
  ["prisma", "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--script"],
  { encoding: "utf8", shell: process.platform === "win32" },
);
const body = (diff.stdout ?? "")
  .split("\n")
  .filter((line) => line.trim() && !line.trim().startsWith("--"))
  .join("\n");
if (body.trim()) throw new Error(`Schema drift after migrate deploy:\n${body}`);

console.log("[verify] OK: fresh database initializes twice and matches schema.prisma");
