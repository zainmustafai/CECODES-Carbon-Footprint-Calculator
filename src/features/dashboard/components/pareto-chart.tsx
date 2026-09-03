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
// cumulative % is up to 85%". So every bar and the line share the navy, and only the vital few
// are orange - which is the whole point of a Pareto: it says where to start, not which scope a
// source belongs to (the category chart already answers that).
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
              tonnes: { label: tUnit("tCo2e"), color: "var(--chart-3)" },
              cumulativePct: { label: t("cumulative"), color: "var(--chart-3)" },
            }}
            className="aspect-16/8 w-full"
          >
            <ComposedChart data={data} margin={{ top: 20, left: 4, right: 8, bottom: 24 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="element"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval={0}
                angle={-35}
                textAnchor="end"
                height={48}
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
                    fill={d.isVitalFew ? "var(--chart-2)" : "var(--chart-3)"}
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
                d.isVitalFew ? "font-medium text-chart-2" : ""
              }`}
            >
              {d.element}
            </th>
            <td
              className={`py-1.5 pl-3 text-right font-mono tabular-nums ${
                d.isVitalFew ? "font-semibold text-chart-2" : ""
              }`}
            >
              {num(d.tonnes, 1)}
            </td>
            <td
              className={`py-1.5 pl-3 text-right font-mono tabular-nums ${
                d.isVitalFew ? "font-semibold text-chart-2" : "text-muted-foreground"
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
