import { describe, expect, it } from "vitest";
import { buildIsoGasTable } from "../iso-gas-table";
import { OTHER_GAS_FALLBACK } from "@/lib/calc/rollup";
import type { CategoryRow } from "../types";

// The ISO 14064-1 table is purely a re-presentation of byCategory's own gas split. The only
// thing worth testing is that it never invents or drops a tonne: every row's sum must equal the
// report's total, the same reconciliation discipline the rest of this round has kept.

describe("buildIsoGasTable", () => {
  it("always includes CO2, CH4 and N2O, even at 0", () => {
    const rows = buildIsoGasTable([]);
    expect(rows).toEqual([
      { gas: "CO2", tonnes: 0 },
      { gas: "CH4", tonnes: 0 },
      { gas: "N2O", tonnes: 0 },
    ]);
  });

  it("sums each gas across every category", () => {
    const byCategory: CategoryRow[] = [
      { scope: "SCOPE_1", category: "Fuentes Fijas", tonnes: 15, co2Tonnes: 10, ch4Tonnes: 3, n2oTonnes: 2 },
      { scope: "SCOPE_1", category: "Fuentes Móviles", tonnes: 5, co2Tonnes: 4, ch4Tonnes: 1, n2oTonnes: 0 },
    ];

    const rows = buildIsoGasTable(byCategory);
    expect(rows).toEqual([
      { gas: "CO2", tonnes: 14 },
      { gas: "CH4", tonnes: 4 },
      { gas: "N2O", tonnes: 2 },
    ]);
  });

  it("adds one row per named gas, largest first, after CO2/CH4/N2O", () => {
    const byCategory: CategoryRow[] = [
      {
        scope: "SCOPE_1",
        category: "Refrigeración",
        tonnes: 13,
        co2Tonnes: 0,
        ch4Tonnes: 0,
        n2oTonnes: 0,
        otherGasesByType: { SF6: 10, NF3: 3 },
      },
    ];

    const rows = buildIsoGasTable(byCategory);
    expect(rows).toEqual([
      { gas: "CO2", tonnes: 0 },
      { gas: "CH4", tonnes: 0 },
      { gas: "N2O", tonnes: 0 },
      { gas: "SF6", tonnes: 10 },
      { gas: "NF3", tonnes: 3 },
    ]);
  });

  it("merges a named gas split across several categories into one row", () => {
    const byCategory: CategoryRow[] = [
      {
        scope: "SCOPE_1",
        category: "Refrigeración - Sede A",
        tonnes: 4,
        otherGasesByType: { "HFC-134a": 4 },
      },
      {
        scope: "SCOPE_1",
        category: "Refrigeración - Sede B",
        tonnes: 6,
        otherGasesByType: { "HFC-134a": 6 },
      },
    ];

    const rows = buildIsoGasTable(byCategory);
    const hfc = rows.find((r) => r.gas === "HFC-134a");
    expect(hfc?.tonnes).toBeCloseTo(10, 6);
  });

  it("puts unidentified pre-blended gas in its own fallback row, last", () => {
    const byCategory: CategoryRow[] = [
      {
        scope: "SCOPE_3",
        category: "Bienes y servicios",
        tonnes: 7,
        otherGasesByType: { PFC: 5, [OTHER_GAS_FALLBACK]: 2 },
      },
    ];

    const rows = buildIsoGasTable(byCategory);
    expect(rows.map((r) => r.gas)).toEqual(["CO2", "CH4", "N2O", "PFC", OTHER_GAS_FALLBACK]);
  });

  it("omits the fallback row entirely when nothing is unidentified", () => {
    const byCategory: CategoryRow[] = [
      { scope: "SCOPE_1", category: "Fuentes Fijas", tonnes: 10, co2Tonnes: 10 },
    ];
    const rows = buildIsoGasTable(byCategory);
    expect(rows.some((r) => r.gas === OTHER_GAS_FALLBACK)).toBe(false);
  });

  it("reconciles to the category totals' grand sum, the same total the report's KPI shows", () => {
    const byCategory: CategoryRow[] = [
      {
        scope: "SCOPE_1",
        category: "Fuentes Fijas",
        tonnes: 10.149,
        co2Tonnes: 9.5,
        ch4Tonnes: 0.4,
        n2oTonnes: 0.249,
      },
      {
        scope: "SCOPE_1",
        category: "Refrigeración",
        tonnes: 13.2,
        otherGasesByType: { SF6: 13.2 },
      },
      {
        scope: "SCOPE_3",
        category: "Bienes y servicios",
        tonnes: 2,
        otherGasesByType: { [OTHER_GAS_FALLBACK]: 2 },
      },
    ];
    const total = byCategory.reduce((sum, c) => sum + c.tonnes, 0);

    const rows = buildIsoGasTable(byCategory);
    const rowSum = rows.reduce((sum, r) => sum + r.tonnes, 0);
    expect(rowSum).toBeCloseTo(total, 6);
  });

  it("treats a category with no gas breakdown at all as contributing 0, not a crash", () => {
    // A handwritten fixture that predates the gas breakdown (2026-08-15): only {scope, category,
    // tonnes}. This must not throw, and must not silently claim tonnes it cannot attribute.
    const byCategory: CategoryRow[] = [{ scope: "SCOPE_1", category: "Fuentes Fijas", tonnes: 10.149 }];
    expect(() => buildIsoGasTable(byCategory)).not.toThrow();
    const rows = buildIsoGasTable(byCategory);
    expect(rows.reduce((sum, r) => sum + r.tonnes, 0)).toBe(0);
  });
});
