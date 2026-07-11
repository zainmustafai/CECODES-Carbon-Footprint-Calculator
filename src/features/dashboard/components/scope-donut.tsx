"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Pie, PieChart, Cell, Label } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SCOPE_COLOR } from "../lib/chart";
import type { ScopeSlice } from "../lib/types";

// Emissions by alcance: a donut with the total in the middle and a legend that reads like the
// mockup, one row per scope with its tonnes and share. The three scope colours (green, amber,
// blue) are the product-wide mapping, so this ties visually to every other scope-coloured mark.
export function ScopeDonut({ slices, total }: { slices: ScopeSlice[]; total: number }) {
  const t = useTranslations("dashboard.byScope");
  const tScopes = useTranslations("dashboard.scopeNames");
  const tSub = useTranslations("dashboard.scopeSubtitles");
  const format = useFormatter();

  const n = (value: number) => format.number(value, { maximumFractionDigits: 1 });
  const pct = (value: number) => format.number(value, { maximumFractionDigits: 1 });

  // Recharts wants numbers; zero-slices are dropped so the ring shows only what exists.
  const data = slices
    .filter((s) => s.tonnes > 0)
    .map((s) => ({ scope: s.scope, tonnes: s.tonnes }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ChartContainer
          config={{}}
          className="mx-auto aspect-square w-full max-w-56"
        >
          <PieChart>
            <Pie
              data={data}
              dataKey="tonnes"
              nameKey="scope"
              innerRadius="62%"
              outerRadius="100%"
              paddingAngle={data.length > 1 ? 2 : 0}
              strokeWidth={0}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.scope} fill={SCOPE_COLOR[d.scope]} />
              ))}
              <Label
                position="center"
                content={({ viewBox }) => {
                  if (!viewBox || !("cx" in viewBox)) return null;
                  const { cx, cy } = viewBox as { cx: number; cy: number };
                  return (
                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
                      <tspan
                        x={cx}
                        y={cy - 6}
                        className="fill-foreground font-mono text-xl font-semibold"
                      >
                        {n(total)}
                      </tspan>
                      <tspan x={cx} y={cy + 14} className="fill-muted-foreground text-[11px]">
                        {t("totalCenter")}
                      </tspan>
                    </text>
                  );
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>

        <ul className="space-y-3">
          {slices.map((s) => (
            <li key={s.scope} className="flex items-start gap-2.5">
              <span
                className="mt-1 size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: SCOPE_COLOR[s.scope] }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {tScopes(s.scope)}{" "}
                  <span className="font-normal text-muted-foreground">
                    · {tSub(s.scope)}
                  </span>
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-semibold tabular-nums">{n(s.tonnes)}</p>
                <p className="text-xs text-muted-foreground tabular-nums">{pct(s.pct)}%</p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
