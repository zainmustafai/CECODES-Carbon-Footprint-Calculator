import { describe, expect, it } from "vitest";
import { buildPdf } from "../build-pdf";
import type { ReportVM } from "../types";

// A first smoke test for this file: none existed before it grew a KPI/bar section, a
// per-element table, and a logo. This does not assert layout (react-pdf has no snapshot
// story here), only that it renders a real PDF for realistic data without throwing.

const base: ReportVM = {
  companyName: "Alimentos del Valle",
  facilityName: "Planta Yumbo",
  year: 2024,
  gwpSet: "AR6",
  gridFactor: "0.217",
  bySede: [],
  activity: [],
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
      uncertaintyPct: "5",
    },
    {
      scope: "SCOPE_2",
      category: "Consumo de energía eléctrica",
      subcategory: null,
      element: "Electricidad",
      unit: "kWh",
      quantity: 500,
      factorValue: "0.217",
      factorUnit: "kg CO2/kWh",
      tonnes: 0.1085,
      uncertaintyPct: null,
    },
  ],
  byScope: [
    { scope: "SCOPE_1", tonnes: 10.149 },
    { scope: "SCOPE_2", tonnes: 0.1085 },
    { scope: "SCOPE_3", tonnes: 0 },
  ],
  byCategory: [
    { scope: "SCOPE_1", category: "Fuentes Fijas", tonnes: 10.149 },
    { scope: "SCOPE_2", category: "Consumo de energía eléctrica", tonnes: 0.1085 },
  ],
  totalTonnes: 10.2575,
  removals: { rows: [], tonnes: 0 },
  cleanTech: [],
  biogenicTonnes: 0,
  biogenicCo2Tonnes: 0,
  biogenicCo2Partial: false,
  missingGridFactor: false,
  missingTransportSubsidyPrice: false,
  unpricedCount: 0,
  generatedAt: new Date("2026-08-04T12:00:00Z"),
};

describe("buildPdf", () => {
  it("renders a non-empty PDF buffer without throwing", async () => {
    const buffer = await buildPdf(base);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    // A real PDF starts with this magic header.
    expect(buffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
  });

  it("renders with zero results and zero totals (a fresh year with no data)", async () => {
    const empty: ReportVM = {
      ...base,
      results: [],
      byScope: [
        { scope: "SCOPE_1", tonnes: 0 },
        { scope: "SCOPE_2", tonnes: 0 },
        { scope: "SCOPE_3", tonnes: 0 },
      ],
      byCategory: [],
      totalTonnes: 0,
    };
    const buffer = await buildPdf(empty);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
