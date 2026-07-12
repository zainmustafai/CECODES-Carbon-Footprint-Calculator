import ExcelJS from "exceljs";
import type { ReportVM } from "./types";

// The Excel export (Requirements 10, 14.7).
//
// Three sheets, in the order someone checking our numbers would want them:
//   Resumen  the totals, the GWP set, and every disclosure
//   Datos    what the company ENTERED, with no arithmetic applied
//   Calculo  what the engine COMPUTED, element by element, with the factor that priced each one
//
// Values are written as NUMBERS, not strings, so the recipient can sum and pivot them. That is the
// point of shipping .xlsx rather than a PDF: CECODES is going to diff this against their own
// spreadsheet, and a column of text they cannot total is useless to them.
//
// The float conversion is honest here for the same reason it is honest in the roll-up: the
// spreadsheet we are being compared against is itself float64. Stored precision is untouched; only
// this rendering is lossy, and only at the last decimal place.

const SCOPE_LABEL: Record<string, string> = {
  SCOPE_1: "Alcance 1",
  SCOPE_2: "Alcance 2",
  SCOPE_3: "Alcance 3",
};

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const TONNES_FMT = "#,##0.000";
const QTY_FMT = "#,##0.######";

function header(sheet: ExcelJS.Worksheet, titles: string[]) {
  const row = sheet.addRow(titles);
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
  });
}

/** A Decimal string to a number for Excel. Null stays empty, never 0: they are different facts. */
function num(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildWorkbook(vm: ReportVM): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CECODES - Huella de Carbono";
  wb.created = vm.generatedAt;

  // ---------------------------------------------------------------- Resumen
  const summary = wb.addWorksheet("Resumen");
  summary.columns = [{ width: 38 }, { width: 24 }, { width: 16 }];

  summary.addRow(["Huella de carbono corporativa"]).font = { bold: true, size: 14 };
  summary.addRow([]);
  summary.addRow(["Empresa", vm.companyName]);
  summary.addRow(["Sede", vm.facilityName]);
  summary.addRow(["Año de reporte", vm.year]);
  summary.addRow(["Conjunto GWP", vm.gwpSet]);
  summary.addRow([
    "Factor de red eléctrica",
    vm.gridFactor === null ? "No cargado" : num(vm.gridFactor),
    vm.gridFactor === null ? "" : "kg CO2/kWh",
  ]);
  summary.addRow(["Generado", vm.generatedAt]);
  summary.addRow([]);

  header(summary, ["Totales por alcance", "t CO2e", ""]);
  for (const row of vm.byScope) {
    const r = summary.addRow([SCOPE_LABEL[row.scope] ?? row.scope, row.tonnes]);
    r.getCell(2).numFmt = TONNES_FMT;
  }
  const totalRow = summary.addRow(["TOTAL", vm.totalTonnes]);
  totalRow.font = { bold: true };
  totalRow.getCell(2).numFmt = TONNES_FMT;
  summary.addRow([]);

  header(summary, ["Totales por categoría", "t CO2e", "Alcance"]);
  for (const row of vm.byCategory) {
    const r = summary.addRow([row.category, row.tonnes, SCOPE_LABEL[row.scope] ?? row.scope]);
    r.getCell(2).numFmt = TONNES_FMT;
  }
  summary.addRow([]);

  // The caveats travel WITH the numbers. A total that is quietly incomplete is worse than no
  // total, and a spreadsheet gets forwarded far away from whoever generated it.
  header(summary, ["Notas y advertencias", "", ""]);

  if (vm.unpricedCount > 0) {
    summary.addRow([
      `ADVERTENCIA: ${vm.unpricedCount} fuente(s) no se pudieron calcular y quedaron EXCLUIDAS de estos totales.`,
    ]).font = { bold: true };
    summary.addRow(["Los totales están incompletos. Una fuente sin factor es un dato desconocido, no un cero."]);
  }
  if (vm.missingGridFactor) {
    summary.addRow([
      `ADVERTENCIA: el año ${vm.year} no tiene factor de red eléctrica cargado, así que el Alcance 2 no se pudo calcular.`,
    ]).font = { bold: true };
  }
  if (vm.biogenicTonnes > 0) {
    summary.addRow(["CO2e de fuentes biogénicas (incluye su CH4 y N2O)", vm.biogenicTonnes]).getCell(2).numFmt = TONNES_FMT;
    summary.addRow(["CO2 biogénico (partida informativa del Protocolo GHG)", vm.biogenicCo2Tonnes]).getCell(2).numFmt = TONNES_FMT;
    summary.addRow([
      "Solo el CO2 biogénico se reporta por separado. El CH4 y el N2O de la biomasa permanecen dentro de los alcances.",
    ]);
    if (vm.biogenicCo2Partial) {
      summary.addRow([
        "Nota: alguna fuente biogénica usa un factor CO2e consolidado que no se puede separar por gas, así que el CO2 biogénico está subestimado.",
      ]);
    }
  }
  summary.addRow([
    "Los totales se calculan en el momento de exportar; no son una instantánea guardada. Un cambio en la biblioteca de factores los cambia.",
  ]);

  // ---------------------------------------------------------------- Datos ingresados
  const data = wb.addWorksheet("Datos");
  data.columns = [
    { header: "Alcance", width: 12 },
    { header: "Categoría", width: 34 },
    { header: "Subcategoría", width: 30 },
    { header: "Elemento", width: 42 },
    { header: "Unidad", width: 12 },
    { header: "Periodo", width: 14 },
    { header: "Cantidad", width: 16 },
  ];
  data.getRow(1).font = { bold: true };
  data.views = [{ state: "frozen", ySplit: 1 }];

  for (const row of vm.activity) {
    const r = data.addRow([
      SCOPE_LABEL[row.scope] ?? row.scope,
      row.category,
      row.subcategory ?? "",
      row.element,
      row.unit,
      row.month === null ? "Anual" : MONTHS[row.month - 1],
      // null, not 0: a cell nobody filled is not a reported zero.
      num(row.value),
    ]);
    r.getCell(7).numFmt = QTY_FMT;
  }

  // ---------------------------------------------------------------- Calculo
  const calc = wb.addWorksheet("Calculo");
  calc.columns = [
    { header: "Alcance", width: 12 },
    { header: "Categoría", width: 34 },
    { header: "Subcategoría", width: 30 },
    { header: "Elemento", width: 42 },
    { header: "Unidad", width: 12 },
    { header: "Cantidad", width: 16 },
    { header: "Factor", width: 18 },
    { header: "Unidad del factor", width: 20 },
    { header: "t CO2e", width: 14 },
  ];
  calc.getRow(1).font = { bold: true };
  calc.views = [{ state: "frozen", ySplit: 1 }];

  for (const row of vm.results) {
    const r = calc.addRow([
      SCOPE_LABEL[row.scope] ?? row.scope,
      row.category,
      row.subcategory ?? "",
      row.element,
      row.unit,
      row.quantity,
      num(row.factorValue),
      row.factorUnit ?? "",
      row.tonnes,
    ]);
    r.getCell(6).numFmt = QTY_FMT;
    r.getCell(9).numFmt = TONNES_FMT;
  }

  const calcTotal = calc.addRow(["", "", "", "", "", "", "", "TOTAL", vm.totalTonnes]);
  calcTotal.font = { bold: true };
  calcTotal.getCell(9).numFmt = TONNES_FMT;

  return wb;
}

// CSV is the same computed rows, flat. Excel is the richer artifact; CSV is for whoever wants to
// pipe it somewhere. Separator is a comma and every field is quoted, so an element name containing
// a comma (there are plenty) cannot shift the columns.
export function buildCsv(vm: ReportVM): string {
  const q = (value: unknown) => {
    if (value === null || value === undefined) return '""';
    return `"${String(value).replace(/"/g, '""')}"`;
  };

  const lines: string[] = [];
  lines.push(
    [
      "Alcance", "Categoria", "Subcategoria", "Elemento", "Unidad",
      "Cantidad", "Factor", "Unidad del factor", "t CO2e",
    ]
      .map(q)
      .join(","),
  );

  for (const row of vm.results) {
    lines.push(
      [
        SCOPE_LABEL[row.scope] ?? row.scope,
        row.category,
        row.subcategory ?? "",
        row.element,
        row.unit,
        row.quantity,
        row.factorValue ?? "",
        row.factorUnit ?? "",
        row.tonnes,
      ]
        .map(q)
        .join(","),
    );
  }

  lines.push(["", "", "", "", "", "", "", "TOTAL", vm.totalTonnes].map(q).join(","));

  if (vm.unpricedCount > 0) {
    lines.push("");
    lines.push(
      q(
        `ADVERTENCIA: ${vm.unpricedCount} fuente(s) no se pudieron calcular y quedaron excluidas. Los totales estan incompletos.`,
      ),
    );
  }

  // A BOM, so Excel opens a UTF-8 CSV with the accents intact instead of mojibake.
  return "﻿" + lines.join("\r\n");
}
