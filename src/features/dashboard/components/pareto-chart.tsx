"use client";

import { useFormatter, useTranslations } from "next-intl";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildParetoSeries, paretoHighlightCount } from "../lib/pareto";
import type { ElementTotal } from "../lib/types";

// Matches the client's own Pareto chart (docs/sample-data/CEC-PR-F-024 - DASHBOARD (2025).xlsx,
// xl/charts/chart3.xml): a bar+line combo, one bar per emission source (element), largest
// first, with a cumulative-percentage line climbing toward 100% on a secondary right-hand axis.
// It is the client's own tool for "which sources should we prioritize first" (their feedback's
// exact framing).
//
// Colour carries ONE meaning here, and it is not the alcance. Client feedback 2026-09-03: "keep
// all of the bars and lines the same color, only change the color for the elements which
// cumulative % is up to 85%". So every bar shares one colour and only the vital few differ -
// which is the whole point of a Pareto: it says where to start, not which scope a source belongs
// to (the category chart already answers that).
//
// The HUES changed on 2026-09-07 and the reason is worth keeping. This chart used navy bars with
// orange highlights, which are literally the Alcance 3 and Alcance 2 tokens, so a reader coming
// from the scope donut read the bars as scopes. The client asked for colours that belong to no
// alcance and supplied them: grey bars (--chart-6), violet for the vital few (--chart-7), and
// their light blue for the cumulative line (--chart-8). Grey and violet sit only 0.07 apart in
// lightness, so the highlight is carried by hue rather than by weight; the table below repeats
// the same violet on the same rows, which is what makes the signal survive that.
export function ParetoChart({ byElement }: { byElement: ElementTotal[] }) {
  const t = useTranslations("dashboard.pareto");
  const tUnit = useTranslations("dashboard");
  const format = useFormatter();

  const series = buildParetoSeries(byElement);
  const highlighted = paretoHighlightCount(series);
  const data = series.map((point, index) => ({
    element: point.element,
    tonnes: point.tonnes,
    cumulativePct: point.cumulativePct,
    isVitalFew: index < highlighted,
  }));

  const truncate = (value: string) => (value.length > 14 ? `${value.slice(0, 13)}…` : value);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{t("title")}</CardTitle>
          <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>
        <span className="text-xs text-muted-foreground">{tUnit("tCo2e")}</span>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          </div>
        ) : (
          <ChartContainer
            config={{
              tonnes: { label: tUnit("tCo2e"), color: "var(--chart-6)" },
              cumulativePct: { label: t("cumulative"), color: "var(--chart-8)" },
            }}
            className="aspect-16/8 w-full"
          >
            {/* These margins carry the rotated x-axis labels, which is why they are not the 8px
                the other charts use. Reported clipped on 2026-09-09, and the numbers below are
                measured rather than guessed: the widest label truncate() can emit is 14 characters
                plus an ellipsis, which is 99px at the 12px tick size in this app's font. Rotated
                -35 degrees that reaches 81px horizontally and 57px vertically.
                textAnchor="end" anchors each label's END at its tick, so the text hangs down and
                to the LEFT. The FIRST label is therefore the one that runs off the canvas, which
                is what left has to cover along with the y-axis width; the last label leans away
                from the right edge and needs nothing. */}
            <ComposedChart data={data} margin={{ top: 20, left: 24, right: 24, bottom: 24 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="element"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval={0}
                angle={-35}
                textAnchor="end"
                // 57px of rotated label plus the 8px tickMargin is 65, so 64 clipped the last
                // row of pixels off every label. 72 leaves a margin for a wider glyph set.
                height={72}
                tickFormatter={truncate}
              />
              <YAxis
                yAxisId="tonnes"
                width={36}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => format.number(v, { maximumFractionDigits: 0 })}
              />
              <YAxis
                yAxisId="pct"
                orientation="right"
                width={40}
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `${format.number(v, { maximumFractionDigits: 0 })}%`}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) =>
                      name === "cumulativePct" ? (
                        <span className="font-mono tabular-nums">
                          {t("cumulative")}: {format.number(Number(value), { maximumFractionDigits: 1 })}%
                        </span>
                      ) : (
                        <span className="font-mono tabular-nums">
                          {format.number(Number(value), { maximumFractionDigits: 1 })} t CO2e
                        </span>
                      )
                    }
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} verticalAlign="top" />
              <Bar
                yAxisId="tonnes"
                dataKey="tonnes"
                name="tonnes"
                fill="var(--color-tonnes)"
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
                isAnimationActive={false}
              >
                {data.map((d, index) => (
                  <Cell
                    key={`${index}-${d.element}`}
                    fill={d.isVitalFew ? "var(--chart-7)" : "var(--chart-6)"}
                  />
                ))}
              </Bar>
              <Line
                yAxisId="pct"
                dataKey="cumulativePct"
                name="cumulativePct"
                type="monotone"
                stroke="var(--color-cumulativePct)"
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--color-cumulativePct)", strokeWidth: 0 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ChartContainer>
        )}

        {data.length > 0 ? <ParetoTable data={data} format={format} t={t} tUnit={tUnit} /> : null}
      </CardContent>
    </Card>
  );
}

/**
 * The numbers under the chart. The client's Excel prints them as two wide rows, one column per
 * element, which reads fine on a spreadsheet and badly on a page: with twenty-odd sources it
 * forces the reader sideways. Transposed to one row per element it carries the identical numbers,
 * ranks top to bottom the way the chart already does, and never needs a horizontal scrollbar.
 */
function ParetoTable({
  data,
  format,
  t,
  tUnit,
}: {
  data: { element: string; tonnes: number; cumulativePct: number; isVitalFew: boolean }[];
  format: ReturnType<typeof useFormatter>;
  t: ReturnType<typeof useTranslations>;
  tUnit: ReturnType<typeof useTranslations>;
}) {
  const num = (value: number, digits: number) =>
    format.number(value, { maximumFractionDigits: digits, minimumFractionDigits: digits });

  return (
    <table className="mt-4 w-full border-collapse text-xs">
      <caption className="sr-only">{t("title")}</caption>
      <thead>
        <tr className="border-b">
          <th scope="col" className="py-1.5 pr-3 text-left font-medium text-muted-foreground">
            {t("elementColumn")}
          </th>
          <th scope="col" className="py-1.5 pl-3 text-right font-medium text-muted-foreground">
            {tUnit("tCo2e")}
          </th>
          <th scope="col" className="py-1.5 pl-3 text-right font-medium text-muted-foreground">
            {t("cumulative")}
          </th>
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.element} className="border-b last:border-0">
            <th
              scope="row"
              className={`py-1.5 pr-3 text-left font-normal ${
                d.isVitalFew ? "font-medium text-chart-7" : ""
              }`}
            >
              {d.element}
            </th>
            <td
              className={`py-1.5 pl-3 text-right font-mono tabular-nums ${
                d.isVitalFew ? "font-semibold text-chart-7" : ""
              }`}
            >
              {num(d.tonnes, 1)}
            </td>
            <td
              className={`py-1.5 pl-3 text-right font-mono tabular-nums ${
                d.isVitalFew ? "font-semibold text-chart-7" : "text-muted-foreground"
              }`}
            >
              {num(d.cumulativePct, 2)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
