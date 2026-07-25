"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SedeTotal } from "../lib/types";

// "Emisiones por sede": one bar per sede for the selected year, largest first, exactly the
// chart the client's Power BI dashboard leads with. Rendered only on the all-facilities view
// with two or more sedes reporting; the screen decides that, this component just draws.
export function SedeBars({ sedes }: { sedes: SedeTotal[] }) {
  const t = useTranslations("dashboard.bySede");
  const format = useFormatter();

  const data = sedes.map((s) => ({ name: s.name, tonnes: s.tonnes }));
  const anyIncomplete = sedes.some((s) => s.incomplete);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={{ tonnes: { label: "tCO2e", color: "var(--chart-4)" } }}
          className="aspect-16/7 w-full"
        >
          <BarChart data={data} margin={{ top: 20, left: 4, right: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} />
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
            <Bar
              dataKey="tonnes"
              fill="var(--chart-4)"
              radius={[6, 6, 0, 0]}
              maxBarSize={64}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="tonnes"
                position="top"
                className="fill-muted-foreground"
                formatter={(value) =>
                  format.number(Number(value ?? 0), { maximumFractionDigits: 1 })
                }
              />
            </Bar>
          </BarChart>
        </ChartContainer>
        {anyIncomplete ? (
          <p className="mt-2 text-xs text-muted-foreground">{t("incompleteNote")}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
