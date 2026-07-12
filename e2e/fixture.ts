import { readFileSync } from "node:fs";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";

// Playwright transpiles these files as CommonJS, and the generated Prisma client uses
// import.meta, so the harness talks to Postgres directly instead of through Prisma.

// Everything the suite creates is namespaced under this prefix and hard deleted afterwards.
// A sweep at setup recovers from a run that crashed before teardown.
export const E2E_COMPANY_PREFIX = "E2E ";
export const E2E_EMAIL_DOMAIN = "e2e.cecodes.invalid";

// The admin specs create GLOBAL reference data (factors, versions, grid years), which lives
// outside any company. These prefixes are what teardown sweeps them by.
export const E2E_FACTOR_PREFIX = "E2E ";
export const E2E_VERSION_PREFIX = "E2E";
export const E2E_GRID_SOURCE_PREFIX = "E2E";
// Far enough out that no real reporting year will ever collide with it.
export const E2E_GRID_YEAR = 2031;

// 2024 has a seeded grid electricity factor, so Scope 2 shows no missing-factor warning.
export const E2E_YEAR = 2024;
// 2020 has no grid factor, so Scope 2 must show the missing-factor warning.
export const E2E_YEAR_WITHOUT_GRID_FACTOR = 2020;
export const E2E_PASSWORD = "E2e-Playwright-1!";

export const FIXTURE_PATH = "e2e/.auth/fixture.json";
export const USER_STORAGE_STATE = "e2e/.auth/user.json";
export const ADMIN_STORAGE_STATE = "e2e/.auth/admin.json";

export type Fixture = {
  email: string;
  companyId: string;
  companyName: string;
  facilityId: string;
  userId: string;
  adminEmail: string;
  adminUserId: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`E2E requires ${name}. It is read from .env.local.`);
  return value;
}

export async function db(): Promise<Client> {
  const client = new Client({
    connectionString: process.env.DIRECT_URL ?? requireEnv("DATABASE_URL"),
  });
  await client.connect();
  return client;
}

export function supabaseAdmin() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// Playwright loads spec files during collection, which happens before globalSetup runs, so
// the fixture can only be read from inside a test or a beforeAll hook.
export function loadFixture(): Fixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Fixture;
}

// Removes every trace of the E2E run: its companies (which cascade to facilities, reporting
// years, activity entries and applicability rows), its app_users rows, its Supabase auth
// users, and the global reference data the admin specs create.
//
// Deleting a Supabase auth user does NOT remove the mirrored app_users row: the signup
// trigger only fires on INSERT, and app_users.id carries no foreign key to auth.users. The
// row has to be deleted here or it is orphaned forever.
export async function purgeE2E(client: Client, companyId?: string) {
  const companies = companyId
    ? { rows: [{ id: companyId }] }
    : await client.query<{ id: string }>(`SELECT id FROM companies WHERE name LIKE $1`, [
        `${E2E_COMPANY_PREFIX}%`,
      ]);

  // Catch users from a run that died before it could create or link its company.
  const users = await client.query<{ id: string }>(
    `SELECT id FROM app_users WHERE email LIKE $1 OR "companyId" = ANY($2::text[])`,
    [`%@${E2E_EMAIL_DOMAIN}`, companies.rows.map((c) => c.id)],
  );

  await client.query(`DELETE FROM app_users WHERE id = ANY($1::text[])`, [
    users.rows.map((u) => u.id),
  ]);
  await client.query(`DELETE FROM companies WHERE id = ANY($1::text[])`, [
    companies.rows.map((c) => c.id),
  ]);

  // Global reference data. Without this, every admin run leaks a factor into the shared
  // library and the "1719 factors" the client sees slowly becomes a lie.
  // emission_factor_changes cascade from emission_factors.
  await client.query(`DELETE FROM emission_factors WHERE element LIKE $1`, [
    `${E2E_FACTOR_PREFIX}%`,
  ]);
  await client.query(`DELETE FROM emission_factor_versions WHERE version LIKE $1`, [
    `${E2E_VERSION_PREFIX}%`,
  ]);
  await client.query(`DELETE FROM grid_electricity_factors WHERE source LIKE $1`, [
    `${E2E_GRID_SOURCE_PREFIX}%`,
  ]);

  const supabase = supabaseAdmin();
  for (const user of users.rows) await supabase.auth.admin.deleteUser(user.id);
}
