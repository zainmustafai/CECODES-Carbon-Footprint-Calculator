import { db } from "../e2e/fixture";

async function main() {
  const client = await db();
  const rows = await client.query(
    `SELECT ae.id, ae."companyId", c.name AS company, ae.element, ae.value, ae."secondaryValue",
            ef."entryMode", ae."updatedAt"
     FROM activity_entries ae
     JOIN emission_factors ef ON ef.id = ae."emissionFactorId"
     JOIN companies c ON c.id = ae."companyId"
     WHERE ef."entryMode" != 'QUANTITY' AND ae.value IS NOT NULL
     ORDER BY ae."updatedAt" DESC`
  );
  console.log(JSON.stringify(rows.rows, null, 2));
  console.log("count:", rows.rowCount);
  await client.end();
}
main();
