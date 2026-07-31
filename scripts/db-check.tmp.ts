// Temporary read-only probe, never committed. Prints only years, never any secret.
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("DATABASE_URL missing from env");
  process.exit(1);
}

const client = new Client({ connectionString: url, connectionTimeoutMillis: 15_000 });
await client.connect();
const grid = await client.query(
  'SELECT year, source FROM grid_electricity_factors ORDER BY year',
);
console.log("grid_electricity_factors:");
for (const row of grid.rows) console.log(`  ${row.year}  (${row.source})`);
await client.end();
