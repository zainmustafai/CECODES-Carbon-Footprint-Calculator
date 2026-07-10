import { describe, expect, it } from "vitest";
import { groupFactors, type FactorRow } from "../group-factors";
import { reportedCount, shapeEntries, type EntryRow } from "../shape-entries";
import { isMonthly, monthsForScope } from "../months";

const factors: FactorRow[] = [
  {
    id: "f1",
    scope: "SCOPE_1",
    category: "Fuentes Fijas",
    subcategory: "Combustibles Sólidos",
    element: "Carbón Genérico",
    unit: "ton",
    biogenic: false,
  },
  {
    id: "f2",
    scope: "SCOPE_1",
    category: "Fuentes Fijas",
    subcategory: "Combustibles Sólidos",
    element: "Bagazo",
    unit: "ton",
    biogenic: true,
  },
  {
    id: "f3",
    scope: "SCOPE_2",
    category: "Consumo de energía eléctrica",
    subcategory: null,
    element: "Electricidad (Red Nacional - SIN)",
    unit: "kWh",
    biogenic: false,
  },
];

function annual(id: string, factorId: string, element: string, value: string): EntryRow {
  return {
    id,
    emissionFactorId: factorId,
    scope: "SCOPE_1",
    category: "Fuentes Fijas",
    subcategory: "Combustibles Sólidos",
    element,
    unit: "ton",
    month: null,
    value,
    factorActive: true,
    biogenic: false,
  };
}

describe("month semantics", () => {
  it("makes Scope 2 monthly and Scopes 1 and 3 annual", () => {
    expect(isMonthly("SCOPE_2")).toBe(true);
    expect(isMonthly("SCOPE_1")).toBe(false);
    expect(isMonthly("SCOPE_3")).toBe(false);

    expect(monthsForScope("SCOPE_2")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(monthsForScope("SCOPE_1")).toEqual([null]);
    expect(monthsForScope("SCOPE_3")).toEqual([null]);
  });
});

describe("groupFactors", () => {
  it("builds a scope, category, subcategory, element tree", () => {
    const grouped = groupFactors(factors);

    expect(grouped.SCOPE_1).toHaveLength(1);
    expect(grouped.SCOPE_1[0].category).toBe("Fuentes Fijas");
    expect(grouped.SCOPE_1[0].subgroups[0].options.map((o) => o.element)).toEqual([
      "Carbón Genérico",
      "Bagazo",
    ]);
    expect(grouped.SCOPE_2[0].subgroups[0].subcategory).toBeNull();
    expect(grouped.SCOPE_3).toEqual([]);
  });
});

describe("shapeEntries", () => {
  const grouped = groupFactors(factors);

  it("shows every library category, even with no sources", () => {
    const scopes = shapeEntries([], [], grouped);
    const scope1 = scopes.find((s) => s.scope === "SCOPE_1");

    expect(scope1?.categories).toHaveLength(1);
    expect(scope1?.categories[0].sources).toEqual([]);
  });

  it("treats a missing applicability row as 'applies'", () => {
    const scopes = shapeEntries([], [], grouped);
    expect(scopes[0].categories[0].applies).toBe(true);
  });

  it("honours an explicit 'no aplica'", () => {
    const scopes = shapeEntries(
      [],
      [{ scope: "SCOPE_1", category: "Fuentes Fijas", applies: false }],
      grouped,
    );
    expect(scopes[0].categories[0].applies).toBe(false);
  });

  it("groups a source's twelve month rows into one source", () => {
    const cells: EntryRow[] = Array.from({ length: 12 }, (_, i) => ({
      id: `e${i + 1}`,
      emissionFactorId: "f3",
      scope: "SCOPE_2",
      category: "Consumo de energía eléctrica",
      subcategory: null,
      element: "Electricidad (Red Nacional - SIN)",
      unit: "kWh",
      month: i + 1,
      value: i < 8 ? "100" : "",
      factorActive: true,
      biogenic: false,
    }));

    const scopes = shapeEntries(cells, [], grouped);
    const source = scopes.find((s) => s.scope === "SCOPE_2")!.categories[0].sources[0];

    expect(source.cells).toHaveLength(12);
    expect(source.cells.map((c) => c.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    // "8 de 12 meses": an empty value is not reported, and it is not a zero either.
    expect(reportedCount(source)).toBe(8);
  });

  it("counts a reported zero, and does not count an empty value", () => {
    const scopes = shapeEntries(
      [annual("e1", "f1", "Carbón Genérico", "0"), annual("e2", "f2", "Bagazo", "")],
      [],
      grouped,
    );
    const sources = scopes[0].categories[0].sources;

    expect(reportedCount(sources.find((s) => s.element === "Carbón Genérico")!)).toBe(1);
    expect(reportedCount(sources.find((s) => s.element === "Bagazo")!)).toBe(0);
  });

  it("keeps a source whose factor was deactivated, using its snapshotted labels", () => {
    const orphan: EntryRow = {
      ...annual("e9", "f-gone", "Elemento Retirado", "5"),
      factorActive: false,
    };

    const scopes = shapeEntries([orphan], [], grouped);
    const source = scopes[0].categories[0].sources[0];

    expect(source.element).toBe("Elemento Retirado");
    expect(source.factorActive).toBe(false);
  });

  it("surfaces a category that exists only in the data, not in the library", () => {
    const moved: EntryRow = { ...annual("e1", "f1", "Carbón", "1"), category: "Categoría Retirada" };

    const scopes = shapeEntries([moved], [], grouped);
    const names = scopes[0].categories.map((c) => c.category);

    expect(names).toContain("Categoría Retirada");
  });
});
