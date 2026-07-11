"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis, Cell } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { YearTotal } from "../lib/types";

// Year over year: one bar per reporting year of the selected facility scope, the current year
// highlighted. It answers the question the headline cannot, whether the footprint is trending
// down, and is the honest home for the reduction story the dashboard exists to tell.
export function YearComparison({
  totals,
  currentYear,
}: {
  totals: YearTotal[];
  currentYear: number;
}) {
  const t = useTranslations("dashboard.comparison");
  const format = useFormatter();

  const data = totals.map((y) => ({ year: String(y.year), tonnes: y.tonnes }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {totals.length >= 2 ? (
          <ChartContainer
            config={{ tonnes: { label: "tCO2e", color: "var(--chart-1)" } }}
            className="aspect-16/7 w-full"
          >
            <BarChart data={data} margin={{ top: 20, left: 4, right: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="year" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis
                width={36}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => format.number(v, { maximumFractionDigits: 0 })}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => (
                      <span className="font-mono tabular-nums">
                        {format.number(Number(value), { maximumFractionDigits: 1 })} t CO2e
                      </span>
                    )}
                  />
                }
              />
              <Bar dataKey="tonnes" radius={[6, 6, 0, 0]} maxBarSize={64} isAnimationActive={false}>
                {data.map((d) => (
                  <Cell
                    key={d.year}
                    // The current year in full green; earlier years in a muted green so the
                    // comparison point stands out without a second accent colour.
                    fill={
                      Number(d.year) === currentYear
                        ? "var(--chart-1)"
                        : "color-mix(in oklch, var(--chart-1), var(--card) 55%)"
                    }
                  />
                ))}
                <LabelList
                  dataKey="tonnes"
                  position="top"
                  className="fill-muted-foreground"
                  formatter={(value) =>
                    format.number(Number(value ?? 0), { maximumFractionDigits: 0 })
                  }
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        ) : (
          <div className="flex aspect-16/7 items-center justify-center rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground">{t("single")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
