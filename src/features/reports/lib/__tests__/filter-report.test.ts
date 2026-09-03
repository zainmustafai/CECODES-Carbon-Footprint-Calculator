import { describe, expect, it } from "vitest";
import { emptyElementGases } from "@/lib/calc/rollup";
import { filterReportVM } from "../filter-report";
import type { ReportVM } from "../types";

// filterReportVM narrows a ReportVM for the dashboard's "download this view as PDF" button. Its
// one job is to mirror dashboard-data.ts's own scope/category narrowing exactly, so the numbers a
// filtered PDF shows can never disagree with what the filtered dashboard showed when the user
// clicked download.

const base: ReportVM = {
  companyName: "Alimentos del Valle",
  companyProfile: {
    sector: null,
    contactEmail: null,
    nit: null,
    employeeCount: null,
    contactName: null,
    contactRole: null,
    contactPhone: null,
    website: null,
  },
  facilityName: null,
  year: 2025,
  gwpSet: "AR6",
  gridFactor: "0.217",
  bySede: [
    { facilityId: "f1", facilityName: "Planta Norte", tonnes: 700, incomplete: false },
    { facilityId: "f2", facilityName: "Planta Sur", tonnes: 300, incomplete: false },
  ],
  activity: [],
  results: [
    {
      scope: "SCOPE_1",
      category: "Fuentes Fijas",
      subcategory: null,
      element: "Diesel",
      unit: "Gal",
      quantity: 100,
      secondaryQuantity: null,
      secondaryUnit: null,
      factorValue: "10.149",
      factorUnit: "kg CO2/gal",
      tonnes: 500,
      gases: emptyElementGases(),
      uncertaintyPct: null,
    },
    {
      scope: "SCOPE_2",
      category: "Consumo de energía eléctrica",
      subcategory: null,
      element: "Electricidad",
      unit: "kWh",
      quantity: 100,
      secondaryQuantity: null,
      secondaryUnit: null,
      factorValue: "0.217",
      factorUnit: "kg CO2/kWh",
      tonnes: 200,
      gases: emptyElementGases(),
      uncertaintyPct: null,
    },
    {
      scope: "SCOPE_3",
      category: "Viajes de negocios",
      subcategory: null,
      element: "Vuelos",
      unit: "km",
      quantity: 100,
      secondaryQuantity: null,
      secondaryUnit: null,
      factorValue: "0.1",
      factorUnit: "kg CO2/km",
      tonnes: 300,
      gases: emptyElementGases(),
      uncertaintyPct: null,
    },
  ],
  byScope: [
    { scope: "SCOPE_1", tonnes: 500 },
    { scope: "SCOPE_2", tonnes: 200 },
    { scope: "SCOPE_3", tonnes: 300 },
  ],
  byCategory: [
    { scope: "SCOPE_1", category: "Fuentes Fijas", tonnes: 500 },
    { scope: "SCOPE_2", category: "Consumo de energía eléctrica", tonnes: 200 },
    { scope: "SCOPE_3", category: "Viajes de negocios", tonnes: 300 },
  ],
  totalTonnes: 1000,
  removals: { rows: [{
    scope: "SCOPE_1",
    category: "Remociones",
    subcategory: null,
    element: "Reforestación",
    unit: "ha",
    quantity: 10,
    secondaryQuantity: null,
    secondaryUnit: null,
    factorValue: null,
    factorUnit: null,
    tonnes: -50,
    gases: emptyElementGases(),
    uncertaintyPct: null,
  }], tonnes: -50 },
  cleanTech: [],
  biogenicTonnes: 12,
  biogenicCo2Tonnes: 5,
  biogenicCo2Partial: false,
  missingGridFactor: false,
  missingTransportSubsidyPrice: false,
  unpricedCount: 2,
  monthly: [],
  appliedFilters: { scope: [], category: null },
  generatedAt: new Date("2026-08-28T12:00:00Z"),
};

describe("filterReportVM", () => {
  it("returns everything unfiltered when neither scope nor category is given", () => {
    const result = filterReportVM(base, { scope: [], category: null });
    expect(result.byCategory).toEqual(base.byCategory);
    expect(result.results).toEqual(base.results);
    expect(result.byScope).toEqual(base.byScope);
    expect(result.totalTonnes).toBe(1000);
    expect(result.appliedFilters).toEqual({ scope: [], category: null });
  });

  it("narrows to the selected scope(s) and recomputes totalTonnes from the filtered categories", () => {
    const result = filterReportVM(base, { scope: ["SCOPE_1"], category: null });
    expect(result.byCategory.map((c) => c.scope)).toEqual(["SCOPE_1"]);
    expect(result.results.map((r) => r.scope)).toEqual(["SCOPE_1"]);
    expect(result.byScope.map((s) => s.scope)).toEqual(["SCOPE_1"]);
    expect(result.totalTonnes).toBe(500);
  });

  it("narrows to a multi-scope selection", () => {
    const result = filterReportVM(base, { scope: ["SCOPE_1", "SCOPE_3"], category: null });
    expect(result.byScope.map((s) => s.scope).sort()).toEqual(["SCOPE_1", "SCOPE_3"]);
    expect(result.totalTonnes).toBe(800);
  });

  it("narrows to a category regardless of scope", () => {
    const result = filterReportVM(base, {
      scope: [],
      category: "Consumo de energía eléctrica",
    });
    expect(result.byCategory).toHaveLength(1);
    expect(result.results.map((r) => r.category)).toEqual(["Consumo de energía eléctrica"]);
    expect(result.totalTonnes).toBe(200);
    // Category alone does not narrow byScope - the donut still shows every scope that exists.
    expect(result.byScope).toEqual(base.byScope);
  });

  it("combines scope AND category", () => {
    const result = filterReportVM(base, { scope: ["SCOPE_1"], category: "Fuentes Fijas" });
    expect(result.byCategory).toHaveLength(1);
    expect(result.totalTonnes).toBe(500);

    const empty = filterReportVM(base, {
      scope: ["SCOPE_2"],
      category: "Fuentes Fijas",
    });
    expect(empty.byCategory).toHaveLength(0);
    expect(empty.totalTonnes).toBe(0);
  });

  it("leaves bySede, removals, cleanTech and disclosure counts untouched by a scope filter", () => {
    const result = filterReportVM(base, { scope: ["SCOPE_1"], category: null });
    expect(result.bySede).toEqual(base.bySede);
    expect(result.removals).toEqual(base.removals);
    expect(result.cleanTech).toEqual(base.cleanTech);
    expect(result.biogenicTonnes).toBe(base.biogenicTonnes);
    expect(result.unpricedCount).toBe(base.unpricedCount);
  });

  it("records the applied filters on the result", () => {
    const result = filterReportVM(base, { scope: ["SCOPE_2"], category: "x" });
    expect(result.appliedFilters).toEqual({ scope: ["SCOPE_2"], category: "x" });
  });
});
