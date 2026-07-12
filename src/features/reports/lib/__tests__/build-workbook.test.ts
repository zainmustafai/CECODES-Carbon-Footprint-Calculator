import { describe, expect, it } from "vitest";
import { buildCsv, buildWorkbook } from "../build-workbook";
import type { ReportVM } from "../types";

// The export is the artifact CECODES will diff against their own spreadsheet, so the thing worth
// testing is not that it renders, but that it does not LIE: it must carry every disclosure, it
// must not turn "not reported" into 0, and its totals must be the engine's totals.

const base: ReportVM = {
  companyName: "Alimentos del Valle",
  facilityName: "Planta Yumbo",
  year: 2024,
  gwpSet: "AR6",
  gridFactor: "0.217",
  activity: [
    {
      scope: "SCOPE_1",
      category: "Fuentes Fijas",
      subcategory: "Combustibles Líquidos (fijos)",
      element: "Diesel",
      unit: "Gal",
      month: null,
      value: "1000",
    },
    // Never reported. Must NOT become a zero in the export.
    {
      scope: "SCOPE_2",
      category: "Consumo de energía eléctrica",
      subcategory: null,
      element: "Electricidad",
      unit: "kWh",
      month: 3,
      value: null,
    },
  ],
  results: [
    {
      scope: "SCOPE_1",
      category: "Fuentes Fijas",
      subcategory: "Combustibles Líquidos (fijos)",
      element: "Diesel",
      unit: "Gal",
      quantity: 1000,
      factorValue: "10.149",
      factorUnit: "kg CO2/gal",
      tonnes: 10.149,
    },
  ],
  byScope: [
    { scope: "SCOPE_1", tonnes: 10.149 },
    { scope: "SCOPE_2", tonnes: 0 },
    { scope: "SCOPE_3", tonnes: 0 },
  ],
  byCategory: [{ scope: "SCOPE_1", category: "Fuentes Fijas", tonnes: 10.149 }],
  totalTonnes: 10.149,
  biogenicTonnes: 0,
  biogenicCo2Tonnes: 0,
  biogenicCo2Partial: false,
  missingGridFactor: false,
  unpricedCount: 0,
  generatedAt: new Date("2026-07-12T12:00:00Z"),
};

async function sheetRows(vm: ReportVM, name: string): Promise<unknown[][]> {
  const wb = buildWorkbook(vm);
  const sheet = wb.getWorksheet(name)!;
  const rows: unknown[][] = [];
  sheet.eachRow((row) => {
    rows.push((row.values as unknown[]).slice(1));
  });
  return rows;
}

describe("buildWorkbook", () => {
  it("writes the three sheets a reviewer needs", () => {
    const wb = buildWorkbook(base);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumen", "Datos", "Calculo"]);
  });

  it("writes quantities and tonnes as NUMBERS, so the recipient can sum them", async () => {
    // The whole reason to ship .xlsx rather than a PDF. A column of text they cannot total is
    // useless to someone trying to reconcile it against their own spreadsheet.
    const rows = await sheetRows(base, "Calculo");
    const diesel = rows.find((r) => r[3] === "Diesel")!;

    expect(typeof diesel[5]).toBe("number"); // quantity
    expect(typeof diesel[6]).toBe("number"); // factor
    expect(typeof diesel[8]).toBe("number"); // tonnes
    expect(diesel[8]).toBeCloseTo(10.149, 6);
  });

  it("keeps a never-reported cell EMPTY instead of turning it into a zero", async () => {
    const rows = await sheetRows(base, "Datos");
    const march = rows.find((r) => r[5] === "Marzo")!;

    // "not reported" and "reported zero" are different facts, and an exported 0 would be read as
    // a measurement by whoever opens this file three months from now.
    expect(march[6]).toBeUndefined();
  });

  it("carries the total, and it is the engine's total", async () => {
    const rows = await sheetRows(base, "Calculo");
    const total = rows.find((r) => r[7] === "TOTAL")!;
    expect(total[8]).toBeCloseTo(base.totalTonnes, 6);
  });

  it("SHOUTS when sources were excluded, because the totals are then incomplete", async () => {
    const rows = await sheetRows(
      { ...base, unpricedCount: 3 },
      "Resumen",
    );
    const text = rows.flat().join(" ");

    expect(text).toMatch(/ADVERTENCIA/);
    expect(text).toMatch(/3 fuente\(s\) no se pudieron calcular/);
    expect(text).toMatch(/EXCLUIDAS/);
  });

  it("warns when Scope 2 could not be priced", async () => {
    const rows = await sheetRows({ ...base, missingGridFactor: true }, "Resumen");
    expect(rows.flat().join(" ")).toMatch(/no tiene factor de red eléctrica/);
  });

  it("separates biogenic CO2 from the biogenic sources' total CO2e", async () => {
    const rows = await sheetRows(
      { ...base, biogenicTonnes: 100, biogenicCo2Tonnes: 98 },
      "Resumen",
    );
    const text = rows.flat().join(" ");

    // Both numbers, and the sentence that stops someone subtracting the wrong one.
    expect(text).toMatch(/CO2e de fuentes biogénicas/);
    expect(text).toMatch(/CO2 biogénico/);
    expect(text).toMatch(/El CH4 y el N2O de la biomasa permanecen dentro de los alcances/);
  });

  it("admits when the biogenic CO2 memo is understated", async () => {
    const rows = await sheetRows(
      { ...base, biogenicTonnes: 100, biogenicCo2Tonnes: 0, biogenicCo2Partial: true },
      "Resumen",
    );
    expect(rows.flat().join(" ")).toMatch(/subestimado/);
  });
});

describe("buildCsv", () => {
  it("quotes every field, so an element name containing a comma cannot shift the columns", () => {
    const csv = buildCsv({
      ...base,
      results: [
        {
          ...base.results[0],
          element: "Viajes aéreos - Recorridos cortos (< 500 km, por recorrido)",
        },
      ],
    });

    const line = csv.split("\r\n").find((l) => l.includes("Viajes"))!;
    expect(line).toContain('"Viajes aéreos - Recorridos cortos (< 500 km, por recorrido)"');
    // Header + one row + total: the comma inside the name must not have created a new column.
    expect(line.split('","')).toHaveLength(9);
  });

  it("starts with a BOM so Excel opens it as UTF-8 rather than mojibake", () => {
    expect(buildCsv(base).charCodeAt(0)).toBe(0xfeff);
  });

  it("escapes an embedded quote by doubling it", () => {
    const csv = buildCsv({
      ...base,
      results: [{ ...base.results[0], element: 'Gas "natural"' }],
    });
    expect(csv).toContain('"Gas ""natural"""');
  });

  it("carries the unpriced warning into the CSV too", () => {
    const csv = buildCsv({ ...base, unpricedCount: 2 });
    expect(csv).toMatch(/ADVERTENCIA/);
  });
});
