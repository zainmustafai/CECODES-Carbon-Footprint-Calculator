import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { hashPassword } from "../src/lib/auth/password";
import { authProvider } from "../src/lib/env";

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
// Same idea, its own year so the grid and subsidy CRUD specs never fight over one row.
export const E2E_SUBSIDY_YEAR = 2030;

// 2024 has a seeded grid electricity factor, so Scope 2 shows no missing-factor warning.
export const E2E_YEAR = 2024;
// A year with no grid factor, so Scope 2 must show the missing-factor warning. The UPME
// import covers 2008-2025 (2020 included, which silently broke this fixture once), so it
// must sit below that series while staying >= the app's MIN_REPORTING_YEAR of 2000.
export const E2E_YEAR_WITHOUT_GRID_FACTOR = 2001;
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

  // A SECOND tenant, which the signed-in user must never be able to reach. Nothing signs in as
  // it; it exists purely to be attacked. Without a real second company, "the data is isolated"
  // is an assertion nobody has ever tested over HTTP.
  victimCompanyId: string;
  victimCompanyName: string;
  victimFacilityId: string;
  victimReportingYearId: string;
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

export type E2EUserOptions = {
  /** null for an account with no tenant at all, which is the whole subject of onboarding.spec.ts. */
  companyId?: string | null;
  role?: "COMPANY_USER" | "CECODES_ADMIN";
};

// The id a disposable account is written under, and, while GoTrue still decides sign-ins, the
// GoTrue account itself. Every spec signs in by typing E2E_PASSWORD into the real login form, so
// whatever the app under test asks about a password is what this has to provision against.
async function provisionAuthUserId(email: string): Promise<string> {
  if (authProvider() === "local") {
    // Self-hosted: there is no GoTrue account to create, so there is no id to be handed one and
    // nothing to wait on. The app_users row createE2EUser writes is the entire account.
    return randomUUID();
  }

  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email,
    password: E2E_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`E2E: could not create auth user ${email}. ${error?.message}`);
  }
  return data.user.id;
}

/**
 * Provisions one disposable account in whichever store the app under test reads, and returns its
 * id. Anything the suite signs in as comes from here.
 *
 * Every caller used to do this itself, straight against GoTrue, and every one of them broke the
 * same two ways under AUTH_PROVIDER=local: supabaseAdmin() throws on a self-hosted .env that
 * legitimately holds no service-role key, and the profile the signup trigger mirrors carries no
 * password, so the sign-in that follows is refused by a hash column that is null. One copy fixes
 * both, and a spec that provisions an account no longer has to know which store is behind it.
 *
 * The app_users row is written here rather than left to the signup trigger even under Supabase.
 * The trigger fires on INSERT only and copies no credential, so a row it made is missing exactly
 * the columns a local sign-in reads, and waiting for it to land was always a race.
 */
export async function createE2EUser(
  client: Client,
  email: string,
  options: E2EUserOptions = {},
): Promise<string> {
  const { companyId = null, role = "COMPANY_USER" } = options;

  const id = await provisionAuthUserId(email);
  const { hash, algo } = await hashPassword(E2E_PASSWORD);

  // ON CONFLICT absorbs one thing only: under the Supabase modes the trigger may already have
  // mirrored this id. Under local the id was minted a moment ago and nothing else has seen it.
  await client.query(
    `INSERT INTO app_users (id, email, role, "companyId", "passwordHash", "passwordAlgo",
                            "emailConfirmedAt", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, now(), now(), now())
     ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, "companyId" = EXCLUDED."companyId",
       "passwordHash" = EXCLUDED."passwordHash", "passwordAlgo" = EXCLUDED."passwordAlgo",
       "emailConfirmedAt" = EXCLUDED."emailConfirmedAt"`,
    [id, email, role, companyId, hash, algo],
  );

  return id;
}

/**
 * Removes one disposable account from both stores, profile first so neither is orphaned.
 *
 * Deleted by id OR by address on purpose: a spec that died between provisioning the auth user and
 * writing the profile leaves one of the two behind, and the address is the only handle anyone has
 * on a row whose id the caller never learned.
 */
export async function deleteE2EUser(client: Client, id: string, email: string): Promise<void> {
  await client.query(`DELETE FROM app_users WHERE id = $1 OR email = $2`, [id, email]);
  // Nothing in GoTrue to remove in local mode, and no service-role key to ask it with. See the
  // same guard in purgeE2E below.
  if (!id || authProvider() === "local") return;
  await supabaseAdmin().auth.admin.deleteUser(id);
}

// Removes every trace of the E2E run: its companies (which cascade to facilities, reporting
// years, activity entries and applicability rows), its app_users rows (which cascade to the
// sessions and reset tokens those accounts opened), the throttle rows its failed sign-ins
// counted, the global reference data the admin specs create, and, where GoTrue still holds
// accounts, the auth users behind them.
//
// In local mode the app_users delete below is the whole job, because that row IS the account.
//
// In the Supabase modes there are two stores and neither delete implies the other. Deleting a
// Supabase auth user does NOT remove the mirrored app_users row: the signup trigger only fires
// on INSERT, and app_users.id carries no foreign key to auth.users. So both halves run, in this
// order, or a row is orphaned in one store or the other forever.
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

  // The sign-in throttle counts against the ADDRESS, in a table shared with real users. Its rows
  // reference no company and no user id, so nothing above cascades them away: auth.spec.ts types a
  // wrong password on purpose, and without this every run leaves a row behind for an address that
  // no longer exists. Keys are built lowercased (signInThrottleKeys), and every E2E address
  // already is. The ip: keys are deliberately left alone; they belong to the machine, not the run.
  await client.query(`DELETE FROM auth_throttle WHERE key LIKE $1`, [
    `email:%@${E2E_EMAIL_DOMAIN}`,
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
  // Same reference-data shape as the grid factor above (client feedback 2026-08-15). A crashed
  // subsidy-CRUD run recovers here instead of leaking a row into the shared global table.
  await client.query(`DELETE FROM transport_subsidy_prices WHERE source LIKE $1`, [
    `${E2E_GRID_SOURCE_PREFIX}%`,
  ]);

  // GoTrue holds nothing in local mode, and a self-hosted .env has no service-role key to ask it
  // with, so supabaseAdmin() is never constructed there: it would throw on the missing variable
  // and take the teardown down with it, after the rows above had already gone.
  if (authProvider() === "local") return;

  const supabase = supabaseAdmin();
  for (const user of users.rows) await supabase.auth.admin.deleteUser(user.id);
}
