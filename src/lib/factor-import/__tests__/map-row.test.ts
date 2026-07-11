import { describe, it, expect } from "vitest";
import { Scope } from "@/lib/generated/prisma/client";
import {
  mapRow,
  parseScope,
  normalizeUnit,
  normalizeSubcategory,
  parseBiogenic,
  isCo2eUnit,
  parseUncertaintyPct,
  gramsToKilograms,
  perGasKilograms,
  type RawRowCells,
} from "@/lib/factor-import/map-row";

// A complete, valid Scope-1 combustion row (columns 1-based), to be tweaked per test.
function combustionRow(): RawRowCells {
  return {
    1: "Alcance 1",
    2: "Fuentes Fijas",
    3: "Combustibles Sólidos (fijos)",
    4: "Carbón Genérico",
    5: "Ton",
    8: "-",
    9: 2534.813,
    10: "kg CO2/ton",
    11: 0.0026,
    13: "FECOC, 2016",
    14: 28.7602,
    16: "kg CH4/ton",
    19: "IPCC, 2006",
    20: 43.1404,
    22: "kg N2O/ton",
    25: "IPCC, 2006",
  };
}

describe("parseScope", () => {
  it("maps the three Alcance values", () => {
    expect(parseScope("Alcance 1")).toBe(Scope.SCOPE_1);
    expect(parseScope("Alcance 2")).toBe(Scope.SCOPE_2);
    expect(parseScope("Alcance 3")).toBe(Scope.SCOPE_3);
  });

  it("returns null for anything unparseable", () => {
    expect(parseScope("A1: emisiones directas")).toBeNull();
    expect(parseScope("Alcance 4")).toBeNull();
    expect(parseScope("garbage")).toBeNull();
    expect(parseScope("")).toBeNull();
    expect(parseScope(null)).toBeNull();
    expect(parseScope(undefined)).toBeNull();
  });
});

describe("normalizeSubcategory", () => {
  it("turns a dash or empty cell into null", () => {
    expect(normalizeSubcategory("-")).toBeNull();
    expect(normalizeSubcategory("")).toBeNull();
    expect(normalizeSubcategory("   ")).toBeNull();
    expect(normalizeSubcategory(null)).toBeNull();
  });

  it("keeps a real subcategory", () => {
    expect(normalizeSubcategory("  Combustibles Sólidos  ")).toBe("Combustibles Sólidos");
  });
});

describe("normalizeUnit", () => {
  it("collapses internal whitespace runs to a single space and trims", () => {
    expect(normalizeUnit("  kg  CO2 /  ton ")).toBe("kg CO2 / ton");
    expect(normalizeUnit("Ha inund. x  días")).toBe("Ha inund. x días");
    expect(normalizeUnit("kWh")).toBe("kWh");
    expect(normalizeUnit("kg\nCO2")).toBe("kg CO2");
  });
});

describe("isCo2eUnit", () => {
  it("recognizes CO2e / CO2eq spellings, with or without spaces", () => {
    expect(isCo2eUnit("kgCO2e/kWh")).toBe(true);
    expect(isCo2eUnit("kg CO2e/ t")).toBe(true);
    expect(isCo2eUnit("kg CO2eq")).toBe(true);
    expect(isCo2eUnit("kgCO2 e/ha")).toBe(true);
  });

  it("does not mistake a pure CO2 unit for CO2e", () => {
    expect(isCo2eUnit("kg CO2/ton")).toBe(false);
    expect(isCo2eUnit("kg CO2/kWh")).toBe(false);
  });
});

describe("gramsToKilograms", () => {
  it("divides by 1000 exactly, avoiding the cached-float trap", () => {
    expect(gramsToKilograms("26.6224")).toBe("0.0266224");
    expect(gramsToKilograms("28.7602")).toBe("0.0287602");
    expect(gramsToKilograms("1000")).toBe("1");
  });
});

describe("parseBiogenic", () => {
  it("is true only for 1 or \"1\"", () => {
    expect(parseBiogenic("1")).toBe(true);
    expect(parseBiogenic(1)).toBe(true);
  });

  it("is false for a dash, zero, empty and null", () => {
    expect(parseBiogenic("-")).toBe(false);
    expect(parseBiogenic(0)).toBe(false);
    expect(parseBiogenic("")).toBe(false);
    expect(parseBiogenic(null)).toBe(false);
  });
});

describe("parseUncertaintyPct", () => {
  it("keeps a percent-sign value as an already-percentage string", () => {
    expect(parseUncertaintyPct("0,30%")).toBe("0.3");
    expect(parseUncertaintyPct("5,00%")).toBe("5");
    expect(parseUncertaintyPct("100,00%")).toBe("100");
  });

  it("multiplies a bare fraction <= 1 by 100", () => {
    expect(parseUncertaintyPct(0.0026)).toBe("0.26");
    expect(parseUncertaintyPct("0.05")).toBe("5");
  });

  it("leaves a bare number greater than 1 as a percentage", () => {
    expect(parseUncertaintyPct(3)).toBe("3");
  });

  it("returns null for a value it cannot parse", () => {
    expect(parseUncertaintyPct("garbage")).toBeNull();
    expect(parseUncertaintyPct("")).toBeNull();
    expect(parseUncertaintyPct(null)).toBeNull();
  });
});

describe("mapRow", () => {
  it("maps a per-gas combustion row into CO2 + CH4 + N2O factors", () => {
    const result = mapRow(combustionRow());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const f = result.factor;
    expect(f.scope).toBe(Scope.SCOPE_1);
    expect(f.category).toBe("Fuentes Fijas");
    expect(f.subcategory).toBe("Combustibles Sólidos (fijos)");
    expect(f.element).toBe("Carbón Genérico");
    expect(f.unit).toBe("Ton");
    expect(f.co2Factor).toBe("2534.813");
    expect(f.co2eFactor).toBeNull();
    expect(f.ch4Factor).toBe("0.0287602");
    expect(f.n2oFactor).toBe("0.0431404");
    expect(f.factorUnit).toBe("kg CO2/ton");
    expect(f.source).toBe("FECOC, 2016; IPCC, 2006");
    expect(f.biogenic).toBe(false);
    expect(f.uncertaintyPct).toBe("0.26");
  });

  it("turns a subcategory of \"-\" into null", () => {
    const row = combustionRow();
    row[3] = "-";
    const result = mapRow(row);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.factor.subcategory).toBeNull();
  });

  it("routes a column-9 value with a CO2e unit into co2eFactor", () => {
    const row: RawRowCells = {
      1: "Alcance 1",
      2: "Cambios Uso Suelo",
      3: "Cambios a tierras forestales",
      4: "Tierras convertidas",
      5: "ha",
      8: "-",
      9: 11492.8,
      10: "kgCO2 e/ha",
      13: "IPCC, 2006",
    };
    const result = mapRow(row);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.factor.co2eFactor).toBe("11492.8");
    expect(result.factor.co2Factor).toBeNull();
  });

  it("maps an HFC block into co2eFactor with its own unit", () => {
    const row: RawRowCells = {
      1: "Alcance 1",
      2: "Emisiones Fugitivas",
      3: "Fugas de refrigerantes",
      4: "Fugas de HCFC-22 / R-22",
      5: "kg",
      8: "-",
      26: "1960",
      27: "kgCO2eq/kg",
      30: "AR6",
    };
    const result = mapRow(row);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.factor.co2eFactor).toBe("1960");
    expect(result.factor.factorUnit).toBe("kgCO2eq/kg");
    expect(result.factor.source).toBe("AR6");
  });

  it("rejects a row with no factor in any column, grams or kilograms", () => {
    const row: RawRowCells = {
      1: "Alcance 3",
      2: "Aguas Residuales",
      3: "-",
      4: "Tratamiento pendiente",
      5: "kg",
      8: "-",
    };
    const result = mapRow(row);
    expect(result).toEqual({ ok: false, reason: "no-factor" });
  });

  it("reads the CH4 kilograms column when the grams column is empty", () => {
    // Real shape from the workbook: 288 CH4 rows and 152 N2O rows carry a value ONLY in the
    // kg column. Ignoring it would silently drop rice cultivation, fugitive gas leaks and
    // coal-mine seepage from the library.
    const row: RawRowCells = {
      1: "Alcance 1",
      2: "Emisiones Fugitivas",
      3: "-",
      4: "Fugas en Extracción de Carbón - Subterránea",
      5: "Ton",
      8: "-",
      15: 19.43,
      16: "kgCH4/t",
      19: "IPCC, 2006",
    };

    const result = mapRow(row);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.factor.ch4Factor).toBe("19.43");
    expect(result.factor.co2Factor).toBeNull();
    expect(result.factor.factorUnit).toBe("kgCH4/t");
  });

  it("prefers the grams column over the kilograms column when both are present", () => {
    const row = combustionRow();
    row[15] = 0.026622399999999997; // the sheet's cached formula result

    const result = mapRow(row);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 28.7602 / 1000, exactly, and not the float-noisy cached value.
    expect(result.factor.ch4Factor).toBe("0.0287602");
  });

  it("strips the float artifacts the sheet authored into its kilogram cells", () => {
    // 1.4740000000000002 is a literal in the workbook, not a formula result. Quantizing to the
    // column's scale keeps a re-import from seeing a change on every run.
    expect(perGasKilograms(null, 1.4740000000000002)).toBe("1.474");
    expect(perGasKilograms(null, 11.349799999999998)).toBe("11.3498");
  });

  it("rejects a row carrying both a pure CO2 value and an SF6 CO2e value", () => {
    const row: RawRowCells = {
      1: "Alcance 1",
      2: "Emisiones Fugitivas",
      3: "Consumo de aislante SF6",
      4: "Uso de SF6",
      5: "kg",
      8: "-",
      9: 100,
      10: "kg CO2/kg",
      36: 25200,
      37: "kgCO2eq/kg",
    };
    const result = mapRow(row);
    expect(result).toEqual({ ok: false, reason: "ambiguous-factor" });
  });

  it("rejects a row whose scope does not parse", () => {
    const row = combustionRow();
    row[1] = "A1: emisiones directas";
    expect(mapRow(row)).toEqual({ ok: false, reason: "bad-scope" });
  });

  it("collapses whitespace in the consumption unit", () => {
    const row = combustionRow();
    row[5] = "  Ton   métrica ";
    const result = mapRow(row);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.factor.unit).toBe("Ton métrica");
  });
});
