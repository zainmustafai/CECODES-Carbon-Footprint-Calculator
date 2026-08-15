import { db } from "../e2e/fixture";

async function main() {
  const client = await db();
  const rows = await client.query(
    `SELECT ae.id, ae.element, ae.value, ry.year, f.name AS facility
     FROM activity_entries ae
     JOIN emission_factors ef ON ef.id = ae."emissionFactorId"
     JOIN reporting_years ry ON ry.id = ae."reportingYearId"
     JOIN facilities f ON f.id = ry."facilityId"
     WHERE ef."entryMode" != 'QUANTITY' AND ae.value IS NOT NULL
     ORDER BY ry.year, ae.element`
  );
  console.log(JSON.stringify(rows.rows, null, 2));
  await client.end();
}
main();
