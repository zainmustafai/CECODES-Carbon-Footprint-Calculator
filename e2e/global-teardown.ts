import { existsSync, readFileSync, rmSync } from "node:fs";
import { FIXTURE_PATH, db, purgeE2E, type Fixture } from "./fixture";

export default async function globalTeardown() {
  const client = await db();

  const companyId = existsSync(FIXTURE_PATH)
    ? (JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Fixture).companyId
    : undefined;

  // With no fixture file (setup itself failed) this still sweeps the whole E2E namespace.
  await purgeE2E(client, companyId);
  await client.end();

  rmSync("e2e/.auth", { recursive: true, force: true });
}
