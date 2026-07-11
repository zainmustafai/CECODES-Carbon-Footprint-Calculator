// Pure mappers for the Excel emission-factor importer.
//
// This module turns one raw worksheet row (the "Jerarquia nueva (2025)" per-gas table) into
// a MappedFactor whose every quantity is a decimal STRING or null. It never touches Prisma's
// client, the filesystem, or exceljs: prisma/import-factors.ts reads the workbook and hands
// each row here as a plain Record<column, cellValue>, which keeps every rule below unit
// testable with no database.
//
// The one dependency is the Prisma.Decimal type, used for exact decimal arithmetic. It is a
// pure decimal.js value with no connection behind it, so importing it costs nothing at test
// time. Quantities are strings for the same reason they are strings everywhere else in this
// codebase: a Postgres NUMERIC cannot survive a round trip through a JavaScript float, and the
// old prototype destroyed every decimal a company entered by using Number().

import { Prisma, Scope } from "@/lib/generated/prisma/client";

// A row addressed by 1-based column number, exactly as the sheet is laid out. The importer
// builds one of these per data row; a missing column is simply undefined.
export type RawRowCells = Record<number, unknown>;

// Every Decimal crosses out of here as a STRING (or null), never a JavaScript number.
export type MappedFactor = {
  scope: Scope;
  category: string;
  subcategory: string | null;
  element: string;
  unit: string;
  co2Factor: string | null;
  ch4Factor: string | null;
  n2oFactor: string | null;
  co2eFactor: string | null;
  factorUnit: string | null;
  source: string | null;
  biogenic: boolean;
  uncertaintyPct: string | null;
};

export type MapResult =
  | { ok: true; factor: MappedFactor }
  | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Cell readers. exceljs hands a cell as a number, a string, a boolean, a
// { result } formula object, a { richText } array, or a { text, hyperlink }
// object. Everything funnels through unwrapCell so nothing downstream has to
// know the shape.
// ---------------------------------------------------------------------------

function unwrapCell(cell: unknown): number | string | boolean | null {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === "number" || typeof cell === "string" || typeof cell === "boolean") {
    return cell;
  }
  if (cell instanceof Date) return cell.toISOString();
  if (typeof cell === "object") {
    const o = cell as Record<string, unknown>;
    // Formula cells: { formula | sharedFormula, result }. The result is what Excel showed.
    if ("result" in o) return unwrapCell(o.result);
    // Rich text runs: { richText: [{ text }] }.
    if ("richText" in o && Array.isArray(o.richText)) {
      return (o.richText as Array<{ text?: unknown }>)
        .map((run) => String(run.text ?? ""))
        .join("");
    }
    // Hyperlink cells: { text, hyperlink }.
    if ("text" in o) return unwrapCell(o.text);
  }
  return null;
}

// Robust text of any cell, trimmed of nothing (callers decide). "" for an empty cell.
export function cellText(cell: unknown): string {
  const value = unwrapCell(cell);
  if (value === null) return "";
  return String(value);
}

// Robust numeric reading of any cell, for the rare caller that wants a JavaScript number
// (never a quantity: those stay strings via decimalString). null when the cell is not numeric.
export function cellNumber(cell: unknown): number | null {
  const value = unwrapCell(cell);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const text = value.replace(/\s/g, "").replace(",", ".").trim();
    if (text === "" || text === "-") return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

// A cell as an exact decimal STRING, or null. A JavaScript number is round-tripped through
// its shortest decimal representation (String), which recovers the authored value for the
// non-computed columns this importer reads. A Colombian decimal comma normalizes to a dot.
// "-" and "" are null, which is how the sheet spells "no value".
function decimalString(cell: unknown): string | null {
  const value = unwrapCell(cell);
  if (value === null) return null;

  let text: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    text = String(value);
  } else if (typeof value === "string") {
    text = value.replace(/\s/g, "").replace(",", ".").trim();
    if (text === "" || text === "-") return null;
    // No sign we care about, no exponent, no Infinity/NaN: reject anything but a plain decimal.
    if (!/^-?\d*\.?\d+$/.test(text)) return null;
  } else {
    return null;
  }

  try {
    return new Prisma.Decimal(text).toString();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Individual field parsers (exported so the tests can pin each rule).
// ---------------------------------------------------------------------------

// "Alcance 1|2|3" -> the enum. Anything else is null, so the importer can skip and report it
// rather than guess a scope. The old 2024 sheet's "A1: emisiones directas" wording is not
// matched on purpose: that sheet is never imported.
export function parseScope(raw: unknown): Scope | null {
  const match = /alcance\s*([123])/i.exec(cellText(raw));
  if (!match) return null;
  switch (match[1]) {
    case "1":
      return Scope.SCOPE_1;
    case "2":
      return Scope.SCOPE_2;
    case "3":
      return Scope.SCOPE_3;
    default:
      return null;
  }
}

// Trim and collapse internal whitespace runs (including newlines and the non-breaking spaces
// Excel emits) to a single space, so "kg  CO2 / ton" and "kg CO2 / ton" are one unit.
export function normalizeUnit(raw: unknown): string {
  return cellText(raw).replace(/\s+/g, " ").trim();
}

// Subcategory: a "-" or an empty cell means "no subcategory", stored as NULL.
export function normalizeSubcategory(raw: unknown): string | null {
  const text = cellText(raw).trim();
  if (text === "" || text === "-") return null;
  return text;
}

// The biogenic flag: the cell equals 1 or "1" is true; "-", 0 and "" are false.
export function parseBiogenic(raw: unknown): boolean {
  const value = unwrapCell(raw);
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value.trim() === "1";
  return false;
}

// True when a "Unidad FE" cell marks its value as already CO2e. Matches CO2 immediately
// followed (optionally across whitespace) by an "e" or "eq": "kgCO2e/kWh", "kg CO2e/ t",
// "kg CO2eq", "kgCO2 e/ha" are CO2e; "kg CO2/ton" is a pure CO2 factor.
export function isCo2eUnit(unit: string): boolean {
  return /co2\s*eq?/i.test(unit);
}

// Uncertainty, normalized to a percentage STRING with at most 4 decimals (the column is
// Decimal(10,4)), or null when it cannot be parsed. A cell that carried a percent sign is
// already a percentage. A bare fraction <= 1 (e.g. 0.0026) is multiplied by 100; a bare
// number > 1 is already a percentage. Never a guess: unparseable stays null.
export function parseUncertaintyPct(raw: unknown): string | null {
  const value = unwrapCell(raw);
  if (value === null) return null;

  let hadPercent = false;
  let text: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    text = String(value);
  } else if (typeof value === "string") {
    hadPercent = value.includes("%");
    text = value.replace(/%/g, "").replace(/\s/g, "").replace(",", ".").trim();
  } else {
    return null;
  }

  if (text === "" || !/^\d*\.?\d+$/.test(text)) return null;

  try {
    const base = new Prisma.Decimal(text);
    const pct = hadPercent ? base : base.lte(1) ? base.mul(100) : base;
    return pct.toDecimalPlaces(4).toString();
  } catch {
    return null;
  }
}

// Grams per unit -> kilograms per unit, exactly. Uses Decimal so the cached-float trap in the
// sheet's kg column (0.026622399999999997) is never reproduced: gramsToKilograms("26.6224")
// is exactly "0.0266224".
export function gramsToKilograms(value: string): string {
  return new Prisma.Decimal(value).div(1000).toString();
}

// The emission-factor columns are NUMERIC(30,10). Quantizing here rather than letting Postgres
// do it keeps the audit diff honest: without it, an authored 1.4740000000000002 would be
// stored as 1.4740000000 and every subsequent importer run would see a "change" and rewrite it.
const FACTOR_SCALE = 10;

function quantizeFactor(value: string): string {
  return new Prisma.Decimal(value).toDecimalPlaces(FACTOR_SCALE).toString();
}

/**
 * A per-gas factor in kilograms per unit, from the two columns the sheet offers.
 *
 * The grams column is authoritative WHEN PRESENT: dividing it by 1000 in Decimal reproduces
 * the authored value exactly, whereas the kg column next to it is a cached Excel formula
 * result carrying float noise (0.026622399999999997).
 *
 * But the grams column is not always populated. 288 CH4 rows and 152 N2O rows in the real
 * workbook carry a value ONLY in the kg column (rice cultivation CH4, natural-gas fugitive
 * leaks, coal-mine seepage), and no row has grams without kg. Refusing to read the kg column
 * would silently drop every one of those factors, which is exactly the class of bug this tool
 * exists to replace. So: prefer grams, fall back to kg, and quantize either way.
 */
export function perGasKilograms(
  gramsCell: unknown,
  kilogramsCell: unknown,
): string | null {
  const grams = decimalString(gramsCell);
  if (grams !== null) return quantizeFactor(gramsToKilograms(grams));

  const kilograms = decimalString(kilogramsCell);
  if (kilograms !== null) return quantizeFactor(kilograms);

  return null;
}

// ---------------------------------------------------------------------------
// Column layout of "Jerarquia nueva (2025)" (1-based), and the row mapper.
// ---------------------------------------------------------------------------

const COL = {
  scope: 1,
  category: 2,
  subcategory: 3,
  element: 4,
  unit: 5,
  biogenic: 8,
  co2: 9,
  co2Unit: 10,
  uncertainty: 11,
  co2Source: 13,
  ch4Grams: 14,
  ch4Kilograms: 15,
  ch4Unit: 16,
  ch4Source: 19,
  n2oGrams: 20,
  n2oKilograms: 21,
  n2oUnit: 22,
  n2oSource: 25,
  hfc: 26,
  hfcUnit: 27,
  hfcSource: 30,
  pfc: 31,
  pfcUnit: 32,
  pfcSource: 35,
  sf6: 36,
  sf6Unit: 37,
  sf6Source: 40,
  nf3: 41,
  nf3Unit: 42,
  nf3Source: 45,
} as const;

const SOURCE_COLUMNS = [
  COL.co2Source,
  COL.ch4Source,
  COL.n2oSource,
  COL.hfcSource,
  COL.pfcSource,
  COL.sf6Source,
  COL.nf3Source,
];

// Distinct, non-empty source cells joined with "; ", preserving column order.
function collectSource(cells: RawRowCells): string | null {
  const seen: string[] = [];
  for (const col of SOURCE_COLUMNS) {
    const text = cellText(cells[col]).trim();
    if (text !== "" && !seen.includes(text)) seen.push(text);
  }
  return seen.length > 0 ? seen.join("; ") : null;
}

/**
 * Map one 2025-sheet data row. Scope-2 rows are returned like any other (the importer diverts
 * them to grid-factor handling by scope); the reasons a row is rejected are:
 *   bad-scope        the Alcance cell did not parse
 *   incomplete       category, element or unit was blank
 *   no-factor        no CO2, CH4, N2O or consolidated CO2e value on the row
 *   ambiguous-factor a pure-CO2 value coexists with an HFC/PFC/SF6/NF3 CO2e value
 *
 * In the real workbook no row is rejected as no-factor once the kg fallback columns are read.
 * The reason is kept because a future sheet revision may add a genuinely empty row, and
 * importing it as a zero-emission factor would be worse than skipping it loudly.
 */
export function mapRow(cells: RawRowCells): MapResult {
  const scope = parseScope(cells[COL.scope]);
  if (!scope) return { ok: false, reason: "bad-scope" };

  const category = cellText(cells[COL.category]).trim();
  const element = cellText(cells[COL.element]).trim();
  const unit = normalizeUnit(cells[COL.unit]);
  if (category === "" || element === "" || unit === "") {
    return { ok: false, reason: "incomplete" };
  }

  const subcategory = normalizeSubcategory(cells[COL.subcategory]);
  const biogenic = parseBiogenic(cells[COL.biogenic]);
  const uncertaintyPct = parseUncertaintyPct(cells[COL.uncertainty]);

  // Per-gas CH4 and N2O: grams column preferred, kg column as the fallback. See perGasKilograms.
  const ch4Factor = perGasKilograms(cells[COL.ch4Grams], cells[COL.ch4Kilograms]);
  const n2oFactor = perGasKilograms(cells[COL.n2oGrams], cells[COL.n2oKilograms]);

  // Column 9 is either a pure CO2 factor or an already-CO2e factor, decided by column 10.
  const col9 = decimalString(cells[COL.co2]);
  const co2eByUnit = col9 !== null && isCo2eUnit(cellText(cells[COL.co2Unit]));

  // A single consolidated CO2e from the HFC / PFC / SF6 / NF3 blocks (mutually exclusive in
  // practice; the first present wins), with its own unit column.
  const hfc = decimalString(cells[COL.hfc]);
  const pfc = decimalString(cells[COL.pfc]);
  const sf6 = decimalString(cells[COL.sf6]);
  const nf3 = decimalString(cells[COL.nf3]);
  let consolidated: string | null = null;
  let consolidatedUnitCol: number | null = null;
  if (hfc !== null) {
    consolidated = hfc;
    consolidatedUnitCol = COL.hfcUnit;
  } else if (pfc !== null) {
    consolidated = pfc;
    consolidatedUnitCol = COL.pfcUnit;
  } else if (sf6 !== null) {
    consolidated = sf6;
    consolidatedUnitCol = COL.sf6Unit;
  } else if (nf3 !== null) {
    consolidated = nf3;
    consolidatedUnitCol = COL.nf3Unit;
  }

  // A row cannot carry both a column-9 CO2/CO2e value and a consolidated CO2e block: which one
  // is the factor is genuinely ambiguous, so refuse it rather than pick.
  if (col9 !== null && consolidated !== null) {
    return { ok: false, reason: "ambiguous-factor" };
  }

  let co2Factor: string | null = null;
  let co2eFactor: string | null = null;
  let factorUnit: string | null = null;

  if (col9 !== null) {
    // Quantized to the column's scale so a re-import compares equal instead of "changing".
    if (co2eByUnit) co2eFactor = quantizeFactor(col9);
    else co2Factor = quantizeFactor(col9);
    factorUnit = normalizeUnit(cells[COL.co2Unit]) || null;
  } else if (consolidated !== null && consolidatedUnitCol !== null) {
    co2eFactor = quantizeFactor(consolidated);
    factorUnit = normalizeUnit(cells[consolidatedUnitCol]) || null;
  }

  // When only per-gas values exist, fall back to their unit column so factorUnit is not blank.
  if (factorUnit === null && ch4Factor !== null) {
    factorUnit = normalizeUnit(cells[COL.ch4Unit]) || null;
  } else if (factorUnit === null && n2oFactor !== null) {
    factorUnit = normalizeUnit(cells[COL.n2oUnit]) || null;
  }

  if (
    co2Factor === null &&
    co2eFactor === null &&
    ch4Factor === null &&
    n2oFactor === null
  ) {
    return { ok: false, reason: "no-factor" };
  }

  return {
    ok: true,
    factor: {
      scope,
      category,
      subcategory,
      element,
      unit,
      co2Factor,
      ch4Factor,
      n2oFactor,
      co2eFactor,
      factorUnit,
      source: collectSource(cells),
      biogenic,
      uncertaintyPct,
    },
  };
}
