import ExcelJS from "exceljs";
import path from "node:path";

const wbPath = path.join(process.cwd(), "docs", "reference", "CEC-PR-CTE-127 - Factores de emisión - Herramienta HC CECODES.xlsx");
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(wbPath);
const sheet = wb.worksheets.find(ws => ws.name.startsWith("Jerarqu") || ws.name === "Emission Factors");

function cellVal(cell) {
  const v = cell.value;
  if (v && typeof v === "object") {
    if ("result" in v) return v.result;
    if ("richText" in v) return v.richText.map(r=>r.text).join("");
    if ("text" in v) return v.text;
  }
  return v;
}

for (let r = 3; r <= sheet.rowCount; r++) {
  const row = sheet.getRow(r);
  const element = cellVal(row.getCell(4));
  if (typeof element === "string" && element.includes("Cabras")) {
    console.log(`row ${r}: element=${element}`);
    console.log(`  ch4Grams(14)=${cellVal(row.getCell(14))} ch4Kg(15)=${cellVal(row.getCell(15))} ch4Unit(16)=${cellVal(row.getCell(16))}`);
    console.log(`  n2oGrams(20)=${cellVal(row.getCell(20))} n2oKg(21)=${cellVal(row.getCell(21))} n2oUnit(22)=${cellVal(row.getCell(22))}`);
  }
}
