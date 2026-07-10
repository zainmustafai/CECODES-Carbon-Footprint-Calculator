import { readFileSync } from "node:fs";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";

// Playwright transpiles these files as CommonJS, and the generated Prisma client uses
// import.meta, so the harness talks to Postgres directly instead of through Prisma.

// Everything the suite creates is namespaced under this prefix and hard deleted afterwards.
// A sweep at setup recovers from a run that crashed before teardown.
export const E2E_COMPANY_PREFIX = "E2E ";
export const E2E_EMAIL_DOMAIN = "e2e.cecodes.invalid";

// 2024 has a seeded grid electricity factor, so Scope 2 shows no missing-factor warning.
export const E2E_YEAR = 2024;
export const E2E_PASSWORD = "E2e-Playwright-1!";

export const FIXTURE_PATH = "e2e/.auth/fixture.json";

export type Fixture = {
  email: string;
  companyId: string;
  companyName: string;
  facilityId: string;
  userId: string;
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

// Removes every trace of the E2E tenant: its companies (which cascade to facilities,
// reporting years, activity entries and applicability rows), its app_users rows, and its
// Supabase auth users.
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

  const supabase = supabaseAdmin();
  for (const user of users.rows) await supabase.auth.admin.deleteUser(user.id);
}
