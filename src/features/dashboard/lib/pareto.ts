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

/**
 * The share of the footprint that counts as the "vital few" in a Pareto reading. The client's own
 * Excel highlights exactly this set (see the chart in their 2026-09-03 feedback).
 */
export const PARETO_HIGHLIGHT_PCT = 85;

/**
 * How many of the leading elements to highlight: every element whose cumulative share is still
 * below the threshold, PLUS the one that first reaches it. The client's chart makes that inclusion
 * explicit - their four highlighted bars run 37,60 / 69,53 / 79,42 / 86,95, so the element that
 * crosses 85 is coloured, not the last one under it.
 *
 * Zero when nothing has been emitted at all, so a chart of zeroes is not painted entirely as the
 * vital few.
 */
export function paretoHighlightCount(
  series: ParetoPoint[],
  threshold: number = PARETO_HIGHLIGHT_PCT,
): number {
  if (series.length === 0) return 0;
  if (series[series.length - 1].cumulativePct <= 0) return 0;

  const crossing = series.findIndex((point) => point.cumulativePct >= threshold);
  // No element reaches the threshold (possible only with negative tonnes in the tail): treat the
  // whole series as the vital few rather than silently highlighting none.
  return crossing === -1 ? series.length : crossing + 1;
}
