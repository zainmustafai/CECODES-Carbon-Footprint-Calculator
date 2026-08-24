"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GasBreakdown } from "../lib/types";

// Emissions by gas: CO2/CH4/N2O first (a small, fixed set, so they stay in the same order every
// time), then one point per named "other" gas the factor library identifies (SF6, PFC, HFC, NF3,
// ...) plus a fallback point for whatever is still unidentified - client feedback 2026-08-15:
// "please include all of the gases separately... specify those 'other' such SF6, NF3, etc."
// Client feedback 2026-08-24: rendered as an area chart, matching the visual language of
// monthly-trend.tsx below it on the dashboard rather than a bar list.
//
// Color: chart-1/2/3 are reserved for Alcance everywhere else in the product (see chart.ts) -
// reusing them here would make a reader who has learned "green = Alcance 1" misread this as
// scope-related. chart-4 is free for exactly this kind of single, unscoped series.
export function GasBars({ breakdown }: { breakdown: GasBreakdown }) {
  const t = useTranslations("dashboard.byGas");
  const tGas = useTranslations("dashboard.gasNames");
  const format = useFormatter();

  const hasAny =
    breakdown.slices.some((s) => s.tonnes > 0) || breakdown.otherGases.some((s) => s.tonnes > 0);
  const otherTonnes = breakdown.otherGases.reduce((sum, s) => sum + s.tonnes, 0);

  const data = [
    ...breakdown.slices.map((s) => ({ gas: tGas(s.gas), tonnes: s.tonnes, pct: s.pct })),
    ...breakdown.otherGases.map((s) => ({
      gas: s.isFallback ? tGas("OTHER") : s.gasType,
      tonnes: s.tonnes,
      pct: s.pct,
    })),
  ];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <span className="text-xs text-muted-foreground">tCO2e</span>
      </CardHeader>
      <CardContent>
        {!hasAny ? (
          <div className="flex aspect-16/6 items-center justify-center rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          </div>
        ) : (
          <ChartContainer
            config={{ tonnes: { label: t("title"), color: "var(--chart-4)" } }}
            className="aspect-16/6 w-full"
          >
            <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="gasFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-tonnes)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--color-tonnes)" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="gas"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={4}
                interval={0}
              />
              <YAxis
                width={36}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => format.number(v, { maximumFractionDigits: 0 })}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelKey="gas"
                    formatter={(value, _name, item) => (
                      <span className="font-mono tabular-nums">
                        {format.number(Number(value), { maximumFractionDigits: 1 })} t CO2e
                        {" - "}
                        {format.number(
                          (item?.payload as { pct?: number } | undefined)?.pct ?? 0,
                          { maximumFractionDigits: 1 },
                        )}
                        %
                      </span>
                    )}
                  />
                }
              />
              <Area
                dataKey="tonnes"
                type="monotone"
                stroke="var(--color-tonnes)"
                strokeWidth={2}
                fill="url(#gasFill)"
                isAnimationActive={false}
                dot={{ r: 3 }}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ChartContainer>
        )}
        {breakdown.otherEntries > 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("otherNote", {
              tonnes: format.number(otherTonnes, { maximumFractionDigits: 1 }),
              pct: format.number(breakdown.otherPct, { maximumFractionDigits: 1 }),
              count: breakdown.otherEntries,
            })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
