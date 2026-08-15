import type { ElementTotal } from "@/lib/calc/rollup";

// The client's Excel Pareto chart (docs/sample-data/CEC-PR-F-024 - DASHBOARD (2025).xlsx,
// xl/charts/chart3.xml) is a bar+line combo: tonnes per element, descending, with a line of
// cumulative percentage climbing toward 100% on a secondary axis. This turns an already
// largest-first ElementTotal[] (rollupYear guarantees the order) into that line, as a pure
// function so the math is unit-tested without rendering a chart.

export type ParetoPoint = {
  element: string;
  tonnes: number;
  /** Cumulative share of the sum of every `tonnes` passed in, 0 to 100. 0 (never NaN) when that
   *  sum is 0, which happens when every element is unreported or nets to zero. */
  cumulativePct: number;
};

export function buildParetoSeries(
  byElement: Pick<ElementTotal, "element" | "tonnes">[],
): ParetoPoint[] {
  const total = byElement.reduce((sum, e) => sum + e.tonnes, 0);

  let cumulative = 0;
  return byElement.map((e) => {
    cumulative += e.tonnes;
    return {
      element: e.element,
      tonnes: e.tonnes,
      cumulativePct: total > 0 ? (cumulative / total) * 100 : 0,
    };
  });
}
