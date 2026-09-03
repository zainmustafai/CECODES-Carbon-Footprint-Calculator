"use client";

import { useFormatter, useTranslations } from "next-intl";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MonthlyPoint } from "../lib/types";

// The monthly trend, which by the domain rules is Scope 2 (electricity) only: it is the one
// thing captured month by month. A month nobody reported is a gap, not a zero, so the line
// breaks rather than implying the plant went dark.
//
// Line and points, not an area: client feedback 2026-09-03, "not an area graph, please use a
// line and points chart, not a continuous line". The visible dot per reported month is what makes
// an isolated month readable at all, since a single point with gaps either side draws no segment.
export function MonthlyTrend({ points, year }: { points: MonthlyPoint[]; year: number }) {
  const t = useTranslations("dashboard.monthly");
  const tMonths = useTranslations("dashboard.months");
  const tCommon = useTranslations("dashboard");
  const format = useFormatter();

  const hasAny = points.some((p) => p.tonnes !== null);

  const data = points.map((p) => ({
    month: tMonths(String(p.month)),
    tonnes: p.tonnes,
  }));

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{t("title")}</CardTitle>
          <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>
        <span className="text-xs text-muted-foreground">
          {tCommon("tCo2ePerMonth", { year: String(year) })}
        </span>
      </CardHeader>
      <CardContent>
        {hasAny ? (
          <ChartContainer
            config={{ tonnes: { label: t("subtitle"), color: "var(--chart-1)" } }}
            className="aspect-16/6 w-full"
          >
            <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={4}
              />
              <YAxis
                width={36}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) =>
                  format.number(v, { maximumFractionDigits: 0 })
                }
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelKey="month"
                    formatter={(value) => (
                      <span className="font-mono tabular-nums">
                        {format.number(Number(value), { maximumFractionDigits: 1 })} t CO2e
                      </span>
                    )}
                  />
                }
              />
              <Line
                dataKey="tonnes"
                type="linear"
                stroke="var(--color-tonnes)"
                strokeWidth={2}
                // A gap stays a gap: never join across a month nobody reported.
                connectNulls={false}
                isAnimationActive={false}
                dot={{ r: 3, fill: "var(--color-tonnes)", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ChartContainer>
        ) : (
          <div className="flex aspect-16/6 items-center justify-center rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
