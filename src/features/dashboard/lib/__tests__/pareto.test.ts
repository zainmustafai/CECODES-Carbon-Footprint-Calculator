import { describe, expect, it } from "vitest";
import { buildParetoSeries } from "../pareto";

describe("buildParetoSeries", () => {
  it("climbs to 100% across many elements, matching the Excel reference shape", () => {
    // Mirrors the shape of the client's own chart3.xml: a big first bar, then smaller ones,
    // the cumulative line closing in on 100% (55.1%, 98.5%, 99.2%, ...).
    const series = buildParetoSeries([
      { element: "Diesel", tonnes: 55.1 },
      { element: "Gasolina", tonnes: 43.4 },
      { element: "GLP", tonnes: 0.7 },
      { element: "Gas natural", tonnes: 0.8 },
    ]);

    expect(series.map((p) => p.element)).toEqual(["Diesel", "Gasolina", "GLP", "Gas natural"]);
    expect(series[0].cumulativePct).toBeCloseTo(55.1, 6);
    expect(series[1].cumulativePct).toBeCloseTo(98.5, 6);
    expect(series[2].cumulativePct).toBeCloseTo(99.2, 6);
    expect(series[3].cumulativePct).toBeCloseTo(100, 6);
  });

  it("puts a single element at 100% immediately", () => {
    const series = buildParetoSeries([{ element: "Diesel", tonnes: 12.3 }]);
    expect(series).toHaveLength(1);
    expect(series[0].cumulativePct).toBeCloseTo(100, 6);
  });

  it("returns 0% for every point, never NaN, when every element is zero", () => {
    const series = buildParetoSeries([
      { element: "Diesel", tonnes: 0 },
      { element: "Gasolina", tonnes: 0 },
    ]);
    expect(series.every((p) => p.cumulativePct === 0)).toBe(true);
    expect(series.some((p) => Number.isNaN(p.cumulativePct))).toBe(false);
  });

  it("returns an empty series for an empty input, without dividing by zero", () => {
    expect(buildParetoSeries([])).toEqual([]);
  });

  it("preserves the tonnes and input order, only adding cumulativePct", () => {
    const input = [
      { element: "A", tonnes: 10 },
      { element: "B", tonnes: 5 },
      { element: "C", tonnes: 5 },
    ];
    const series = buildParetoSeries(input);
    expect(series.map((p) => p.tonnes)).toEqual([10, 5, 5]);
    expect(series[0].cumulativePct).toBeCloseTo(50, 6);
    expect(series[1].cumulativePct).toBeCloseTo(75, 6);
    expect(series[2].cumulativePct).toBeCloseTo(100, 6);
  });
});
