// Temporary connectivity probe, never committed. Prints latency only, never the URL.
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("DATABASE_URL missing from env");
  process.exit(1);
}

for (let attempt = 1; attempt <= 3; attempt++) {
  const started = Date.now();
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 15_000 });
  try {
    await client.connect();
    await client.query("select 1");
    console.log(`attempt ${attempt}: ok in ${Date.now() - started}ms`);
  } catch (err) {
    const e = err as Error;
    console.log(`attempt ${attempt}: FAIL after ${Date.now() - started}ms (${e.constructor.name}: ${e.message})`);
  } finally {
    await client.end().catch(() => {});
  }
}
