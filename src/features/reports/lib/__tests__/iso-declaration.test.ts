import { describe, expect, it } from "vitest";
import { buildIsoDeclaration, co2eFromColumns } from "../iso-declaration";
import type { ResultRow } from "../types";

// The declaration is the artifact CECODES files against ISO 14064-1, so the bar is not "it
// renders" but "every number in it reconciles to every other number in it". Three properties do
// that work: an element's gas columns imply its own CO2e under AR6, each subtotal is exactly the
// sum of what sits under it, and the grand total is the report's own total.

const row = (
  over: Partial<ResultRow> & Pick<ResultRow, "scope" | "category" | "element" | "tonnes">,
): ResultRow => ({
  subcategory: null,
  unit: "u",
  quantity: 1,
  secondaryQuantity: null,
  secondaryUnit: null,
  factorValue: null,
  factorUnit: null,
  uncertaintyPct: null,
  gases: {
    co2MassKg: 0,
    ch4FossilMassKg: 0,
    ch4NonFossilMassKg: 0,
    n2oMassKg: 0,
    preBlendedCo2eKgByType: {},
  },
  ...over,
});

// The client's own pivot row, transcribed: CO2 4.929.185,89 kg + CH4 fósil 38,81 kg + N2O 155,25
// kg, totalling 4.972.725,73 kg CO2e.
const clientFreightRow = row({
  scope: "SCOPE_3",
  category: "C9: Transporte y distribución (aguas abajo)",
  element: "C9: Transporte terrestre de carga (camiones de servicio medianos y pesados)",
  tonnes: 4972.72573,
  gases: {
    co2MassKg: 4929185.89,
    ch4FossilMassKg: 38.81,
    ch4NonFossilMassKg: 0,
    n2oMassKg: 155.25,
    preBlendedCo2eKgByType: {},
  },
});

const refrigerantRow = row({
  scope: "SCOPE_1",
  category: "Emisiones fugitivas",
  element: "R-407C",
  tonnes: 139.664,
  gases: {
    co2MassKg: 0,
    ch4FossilMassKg: 0,
    ch4NonFossilMassKg: 0,
    n2oMassKg: 0,
    preBlendedCo2eKgByType: { HFC: 139664 },
  },
});

const biogenicRow = row({
  scope: "SCOPE_3",
  category: "C5: Residuos generados en operaciones",
  element: "C5: Residuos sólidos a relleno sanitario semiaerobico",
  tonnes: 7.43445,
  gases: {
    co2MassKg: 0,
    ch4FossilMassKg: 0,
    ch4NonFossilMassKg: 275.35,
    n2oMassKg: 0,
    preBlendedCo2eKgByType: {},
  },
});

const unidentifiedRow = row({
  scope: "SCOPE_3",
  category: "C1: Bienes y servicios adquiridos",
  element: "Cartón",
  tonnes: 5.856,
  gases: {
    co2MassKg: 0,
    ch4FossilMassKg: 0,
    ch4NonFossilMassKg: 0,
    n2oMassKg: 0,
    preBlendedCo2eKgByType: { "Otros gases sin identificar": 5856 },
  },
});

describe("buildIsoDeclaration", () => {
  it("reproduces the client's own row arithmetic: gas mass times GWP equals the CO2e", () => {
    const { rows } = buildIsoDeclaration([clientFreightRow]);
    const element = rows.find((r) => r.level === "element")!;

    expect(element.gases.co2Kg).toBeCloseTo(4929185.89, 2);
    expect(element.gases.ch4FossilKg).toBeCloseTo(38.81, 2);
    expect(element.gases.n2oKg).toBeCloseTo(155.25, 2);
    // Their stated total for the row, to the nearest kg.
    expect(co2eFromColumns(element.gases, "AR6")).toBeCloseTo(4972725.6, 0);
  });

  it("prices non-fossil CH4 at 27, matching the client's residuos row exactly", () => {
    const { rows } = buildIsoDeclaration([biogenicRow]);
    const element = rows.find((r) => r.level === "element")!;
    expect(element.gases.ch4NonFossilKg).toBeCloseTo(275.35, 2);
    // 275,35 x 27 = 7.434,45 kg CO2e, the number their pivot prints.
    expect(co2eFromColumns(element.gases, "AR6")).toBeCloseTo(7434.45, 2);
  });

  it("puts a refrigerant in the HFC column as CO2e, with no mass claimed", () => {
    const { rows } = buildIsoDeclaration([refrigerantRow]);
    const element = rows.find((r) => r.level === "element")!;
    expect(element.gases.hfcKg).toBeCloseTo(139664, 2);
    expect(element.gases.co2Kg).toBe(0);
    // Their pivot shows Total kg HFCs identical to Total kg CO2e for every refrigerant row.
    expect(element.gases.co2eKg).toBeCloseTo(element.gases.hfcKg, 2);
  });

  it("nests Alcance, then Categoría, then Elemento, with Alcance 1 first", () => {
    const { rows } = buildIsoDeclaration([
      clientFreightRow,
      refrigerantRow,
      biogenicRow,
    ]);
    expect(rows.map((r) => [r.level, r.label])).toEqual([
      ["scope", "Alcance 1"],
      ["category", "Emisiones fugitivas"],
      ["element", "R-407C"],
      ["scope", "Alcance 3"],
      ["category", "C9: Transporte y distribución (aguas abajo)"],
      ["element", "C9: Transporte terrestre de carga (camiones de servicio medianos y pesados)"],
      ["category", "C5: Residuos generados en operaciones"],
      ["element", "C5: Residuos sólidos a relleno sanitario semiaerobico"],
    ]);
  });

  it("makes every subtotal the exact sum of what sits under it", () => {
    const extra = row({
      scope: "SCOPE_3",
      category: "C9: Transporte y distribución (aguas abajo)",
      element: "C9: Transporte aéreo de carga (aeronaves)",
      tonnes: 367.28,
      gases: {
        co2MassKg: 364204.79,
        ch4FossilMassKg: 0,
        ch4NonFossilMassKg: 0,
        n2oMassKg: 11.26,
        preBlendedCo2eKgByType: {},
      },
    });
    const { rows, total } = buildIsoDeclaration([clientFreightRow, extra, refrigerantRow]);

    const scope3 = rows.find((r) => r.level === "scope" && r.label === "Alcance 3")!;
    const c9 = rows.find((r) => r.level === "category" && r.label.startsWith("C9"))!;
    const c9Elements = rows.filter((r) => r.level === "element" && r.label.startsWith("C9"));

    const summed = c9Elements.reduce((sum, r) => sum + r.gases.co2eKg, 0);
    expect(c9.gases.co2eKg).toBeCloseTo(summed, 6);
    expect(scope3.gases.co2eKg).toBeCloseTo(c9.gases.co2eKg, 6);
    expect(c9.gases.co2Kg).toBeCloseTo(4929185.89 + 364204.79, 2);

    // And the grand total is the sum of the scopes.
    const scopes = rows.filter((r) => r.level === "scope");
    expect(total.co2eKg).toBeCloseTo(
      scopes.reduce((sum, r) => sum + r.gases.co2eKg, 0),
      6,
    );
  });

  it("shares one percentage base across every level, and the scopes add to 100", () => {
    const { rows, total } = buildIsoDeclaration([clientFreightRow, refrigerantRow, biogenicRow]);
    const scopes = rows.filter((r) => r.level === "scope");
    expect(scopes.reduce((sum, r) => sum + r.gases.pct, 0)).toBeCloseTo(100, 6);
    expect(total.pct).toBeCloseTo(100, 6);
  });

  it("discloses pre-blended CO2e whose gas was never identified, in its own column", () => {
    const withUnknown = buildIsoDeclaration([unidentifiedRow]);
    expect(withUnknown.hasUnidentified).toBe(true);
    const element = withUnknown.rows.find((r) => r.level === "element")!;
    expect(element.gases.unidentifiedKg).toBeCloseTo(5856, 2);
    expect(element.gases.hfcKg).toBe(0);

    const withoutUnknown = buildIsoDeclaration([refrigerantRow]);
    expect(withoutUnknown.hasUnidentified).toBe(false);
  });

  it("returns an empty declaration rather than dividing by zero", () => {
    const empty = buildIsoDeclaration([]);
    expect(empty.rows).toEqual([]);
    expect(empty.total.co2eKg).toBe(0);
    expect(empty.total.pct).toBe(0);
    expect(empty.hasUnidentified).toBe(false);
  });

  it("never divides by zero when every row is zero", () => {
    const zero = row({ scope: "SCOPE_1", category: "C", element: "E", tonnes: 0 });
    const { total, rows } = buildIsoDeclaration([zero]);
    expect(total.pct).toBe(0);
    expect(rows.every((r) => r.gases.pct === 0)).toBe(true);
  });
});
