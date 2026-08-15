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
import { buildParetoSeries } from "../lib/pareto";
import { SCOPE_COLOR } from "../lib/chart";
import type { ElementTotal } from "../lib/types";

// Matches the client's own Pareto chart (docs/sample-data/CEC-PR-F-024 - DASHBOARD (2025).xlsx,
// xl/charts/chart3.xml): a bar+line combo, one bar per emission source (element), largest
// first, with a cumulative-percentage line climbing toward 100% on a secondary right-hand axis.
// It is the client's own tool for "which sources should we prioritize first" (their feedback's
// exact framing). Bars take their element's scope colour, same convention as CategoryBars, so a
// source still reads back to its Alcance even ranked out of category order.
export function ParetoChart({ byElement }: { byElement: ElementTotal[] }) {
  const t = useTranslations("dashboard.pareto");
  const tUnit = useTranslations("dashboard");
  const format = useFormatter();

  const series = buildParetoSeries(byElement);
  const data = series.map((point, index) => ({
    element: point.element,
    scope: byElement[index].scope,
    tonnes: point.tonnes,
    cumulativePct: point.cumulativePct,
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
              tonnes: { label: tUnit("tCo2e"), color: "var(--chart-1)" },
              cumulativePct: { label: t("cumulative"), color: "var(--chart-5)" },
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
                  <Cell key={`${index}-${d.element}`} fill={SCOPE_COLOR[d.scope]} />
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
      </CardContent>
    </Card>
  );
}
