import { GWP } from "@/lib/gwp";
import type { GwpSet } from "@/lib/generated/prisma/client";
import type { ResultRow } from "./types";

// The "Declaración consolidada GEI (ISO 14064-1)" the client asked for on 2026-09-03, replacing
// the flat gas list this report used to carry.
//
// It is a three level pivot - Alcance, then Categoría, then Elemento - with one column per gas.
// Two things about it are unusual enough to be worth stating plainly, because both were verified
// against the client's own file rather than assumed:
//
// 1. The CO2, CH4 and N2O columns are gas MASS in kilograms, NOT CO2e. The HFCs, PFCs, SF6 and
//    NF3 columns ARE CO2e, because the factor library never retained those gases' mass. Their
//    pivot proves it: "C9: Transporte terrestre de carga" lists CO2 4.929.185,89 + CH4 fósil
//    38,81 + N2O 155,25 against a Total kg CO2e of 4.972.725,73, and
//    4929185.89 + 38.81 x 29.8 + 155.25 x 273 is exactly that. Meanwhile every refrigerant row
//    has Total kg HFCs identical to its Total kg CO2e.
// 2. CH4 is split fossil / non-fossil, which is the same split the GWP that priced it already
//    implies (29.8 vs 27 under AR6, selected by the factor's biogenic flag).
//
// The one column that is ours rather than theirs is "sin identificar": a pre-blended factor whose
// gas the library never captured contributes CO2e that belongs to no named column, and dropping
// it would break the reconciliation silently. It is emitted only when some row actually has it.

export type IsoGasColumns = {
  /** Gas mass, kg. */
  co2Kg: number;
  ch4FossilKg: number;
  ch4NonFossilKg: number;
  n2oKg: number;
  /** Already CO2e, kg: the library stores these pre-blended. */
  hfcKg: number;
  pfcKg: number;
  sf6Kg: number;
  nf3Kg: number;
  /** CO2e kg that arrived pre-blended with no gas identified. */
  unidentifiedKg: number;
  /** The row's total, kg CO2e. Equal to the gas columns once each mass is weighted by its GWP. */
  co2eKg: number;
  tonnes: number;
  /** Share of the report's grand total, 0 to 100. */
  pct: number;
};

export type IsoDeclarationRow = {
  /** Drives indentation and emphasis; "scope" and "category" rows are subtotals. */
  level: "scope" | "category" | "element";
  label: string;
  gases: IsoGasColumns;
};

export type IsoDeclaration = {
  rows: IsoDeclarationRow[];
  /** The "Total general" row. */
  total: IsoGasColumns;
  /** True when any row carries pre-blended CO2e whose gas was never identified, so the report can
   *  render that column only when it means something. */
  hasUnidentified: boolean;
};

const SCOPE_LABEL: Record<string, string> = {
  SCOPE_1: "Alcance 1",
  SCOPE_2: "Alcance 2",
  SCOPE_3: "Alcance 3",
};

const SCOPE_ORDER = ["SCOPE_1", "SCOPE_2", "SCOPE_3"] as const;

function emptyColumns(): IsoGasColumns {
  return {
    co2Kg: 0,
    ch4FossilKg: 0,
    ch4NonFossilKg: 0,
    n2oKg: 0,
    hfcKg: 0,
    pfcKg: 0,
    sf6Kg: 0,
    nf3Kg: 0,
    unidentifiedKg: 0,
    co2eKg: 0,
    tonnes: 0,
    pct: 0,
  };
}

function add(target: IsoGasColumns, source: IsoGasColumns): void {
  target.co2Kg += source.co2Kg;
  target.ch4FossilKg += source.ch4FossilKg;
  target.ch4NonFossilKg += source.ch4NonFossilKg;
  target.n2oKg += source.n2oKg;
  target.hfcKg += source.hfcKg;
  target.pfcKg += source.pfcKg;
  target.sf6Kg += source.sf6Kg;
  target.nf3Kg += source.nf3Kg;
  target.unidentifiedKg += source.unidentifiedKg;
  target.co2eKg += source.co2eKg;
  target.tonnes += source.tonnes;
}

/** One element's row. The CO2e is taken from the element's own tonnes rather than re-derived, so
 *  the declaration can never disagree with the totals the rest of the report prints. */
function columnsFor(row: ResultRow): IsoGasColumns {
  const pre = row.gases.preBlendedCo2eKgByType;
  const named = new Set(["HFC", "PFC", "SF6", "NF3"]);
  let unidentified = 0;
  for (const [gasType, kg] of Object.entries(pre)) {
    if (!named.has(gasType)) unidentified += kg;
  }

  return {
    co2Kg: row.gases.co2MassKg,
    ch4FossilKg: row.gases.ch4FossilMassKg,
    ch4NonFossilKg: row.gases.ch4NonFossilMassKg,
    n2oKg: row.gases.n2oMassKg,
    hfcKg: pre.HFC ?? 0,
    pfcKg: pre.PFC ?? 0,
    sf6Kg: pre.SF6 ?? 0,
    nf3Kg: pre.NF3 ?? 0,
    unidentifiedKg: unidentified,
    co2eKg: row.tonnes * 1000,
    tonnes: row.tonnes,
    pct: 0,
  };
}

/**
 * The CO2e a row's gas columns imply, under the given GWP set. Only used to verify the
 * declaration against itself; the printed CO2e always comes from the engine's own tonnes.
 */
export function co2eFromColumns(columns: IsoGasColumns, gwpSet: GwpSet): number {
  const gwp = GWP[gwpSet];
  return (
    columns.co2Kg * gwp.co2 +
    columns.ch4FossilKg * gwp.ch4Fossil +
    columns.ch4NonFossilKg * gwp.ch4NonFossil +
    columns.n2oKg * gwp.n2o +
    columns.hfcKg +
    columns.pfcKg +
    columns.sf6Kg +
    columns.nf3Kg +
    columns.unidentifiedKg
  );
}

/**
 * Builds the declaration from the report's element rows. `results` is the right seam: it already
 * excludes unpriced entries and removals, it sums to the report's own total by construction, and
 * filterReportVM narrows it, so a "download this view" PDF gets a correctly narrowed declaration
 * with no extra work.
 *
 * Rows are ordered Alcance 1, 2, 3, then categories and elements largest first inside each level,
 * which is this product's convention everywhere else. The client's own pivot happens to sort
 * elements alphabetically; ranking by size is what makes a declaration readable at a glance and
 * matches every other table in the report.
 */
export function buildIsoDeclaration(results: ResultRow[]): IsoDeclaration {
  const rows: IsoDeclarationRow[] = [];
  const total = emptyColumns();

  // scope -> category -> element, preserving insertion so the sort below is the only ordering.
  const byScope = new Map<string, Map<string, { label: string; columns: IsoGasColumns }[]>>();

  for (const row of results) {
    const categories = byScope.get(row.scope) ?? new Map();
    const elements = categories.get(row.category) ?? [];
    elements.push({ label: row.element, columns: columnsFor(row) });
    categories.set(row.category, elements);
    byScope.set(row.scope, categories);
  }

  for (const scope of SCOPE_ORDER) {
    const categories = byScope.get(scope);
    if (!categories) continue;

    const scopeColumns = emptyColumns();
    const categoryBlocks: { label: string; columns: IsoGasColumns; elements: IsoDeclarationRow[] }[] =
      [];

    for (const [category, elements] of categories) {
      const categoryColumns = emptyColumns();
      const elementRows: IsoDeclarationRow[] = [];

      for (const element of [...elements].sort((a, b) => b.columns.tonnes - a.columns.tonnes)) {
        add(categoryColumns, element.columns);
        elementRows.push({ level: "element", label: element.label, gases: element.columns });
      }

      add(scopeColumns, categoryColumns);
      categoryBlocks.push({ label: category, columns: categoryColumns, elements: elementRows });
    }

    add(total, scopeColumns);
    rows.push({ level: "scope", label: SCOPE_LABEL[scope] ?? scope, gases: scopeColumns });

    for (const block of categoryBlocks.sort((a, b) => b.columns.tonnes - a.columns.tonnes)) {
      rows.push({ level: "category", label: block.label, gases: block.columns });
      rows.push(...block.elements);
    }
  }

  // Percentages last, once the grand total is known, so every level shares one base.
  const base = total.tonnes;
  const withPct = (columns: IsoGasColumns) => {
    columns.pct = base === 0 ? 0 : (columns.tonnes / base) * 100;
  };
  for (const row of rows) withPct(row.gases);
  withPct(total);

  return {
    rows,
    total,
    hasUnidentified: rows.some((row) => row.gases.unidentifiedKg !== 0),
  };
}
