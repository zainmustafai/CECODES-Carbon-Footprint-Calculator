"use client";

import { useFormatter, useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SCOPE_COLOR } from "../lib/chart";
import type { CategorySlice, ElementTotal } from "../lib/types";
import type { Scope } from "@/lib/generated/prisma/client";

type DetailBar = { name: string; scope: Scope; tonnes: number };

/**
 * Rendered INSTEAD OF the scope donut (dashboard-screen.tsx decides when) whenever the active
 * scope filter checks 1 or 2 of the three scopes. A donut whose ring includes the very scope the
 * user just asked to see stops being a breakdown and starts being noise the moment a filter is
 * active, so this shows three summary cards instead: a plain total for exactly the scope(s)
 * checked, and the SAME already-filtered current.byCategory/byElement CategoryBars and the Pareto
 * chart already use, redrawn as two column charts - the shape the client's own reference workbook
 * uses (docs/sample-data/.../chart11.xml "Subcategoria", chart12.xml "Categorias"). Every number
 * here reconciles to the KPI card by construction: nothing is recomputed, only redrawn.
 */
export function ScopeDetailBars({
  scopes,
  total,
  byCategory,
  byElement,
}: {
  scopes: Scope[];
  total: number;
  byCategory: CategorySlice[];
  byElement: ElementTotal[];
}) {
  const t = useTranslations("dashboard.scopeDetail");
  const tScopes = useTranslations("dashboard.scopeNames");
  const tUnit = useTranslations("dashboard");
  const format = useFormatter();

  const n = (value: number) =>
    format.number(value, { maximumFractionDigits: 1 });
  const scopeLabel = scopes.map((s) => tScopes(s)).join(", ");

  const categoryData: DetailBar[] = byCategory.map((c) => ({
    name: c.category,
    scope: c.scope,
    tonnes: c.tonnes,
  }));
  const elementData: DetailBar[] = byElement.map((e) => ({
    name: e.element,
    scope: e.scope,
    tonnes: e.tonnes,
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-1 pt-6">
          <p className="text-muted-foreground text-sm">{t("total")}</p>
          <p className="font-mono font-semibold tabular-nums text-4xl">
            {n(total)}
            <span className="ml-1.5 font-normal text-muted-foreground text-base">
              tCO2e
            </span>
          </p>
          <p className="text-muted-foreground text-xs">{scopeLabel}</p>
        </CardContent>
      </Card>

      <DetailBarCard
        title={t("byCategory")}
        unit={tUnit("tCo2e")}
        empty={t("emptyCategory")}
        data={categoryData}
        n={n}
      />

      <DetailBarCard
        title={t("byElement")}
        unit={tUnit("tCo2e")}
        empty={t("emptyElement")}
        data={elementData}
        n={n}
      />
    </div>
  );
}

// Shared by both charts below: a plain vertical column chart, one bar per name, coloured by that
// row's own scope (same SCOPE_COLOR convention as CategoryBars/ParetoChart) so a bar still reads
// back to its Alcance even when only one or two scopes are on screen. Each bar carries its exact
// tonnage as a label so the "total per category"/"total per element" numbers this card promises
// are readable at a glance, not only on hover.
function DetailBarCard({
  title,
  unit,
  empty,
  data,
  n,
}: {
  title: string;
  unit: string;
  empty: string;
  data: DetailBar[];
  n: (value: number) => string;
}) {
  const truncate = (value: string) =>
    value.length > 12 ? `${value.slice(0, 11)}…` : value;

  return (
    <Card>
      <CardHeader className="flex-row justify-between items-center space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <span className="text-muted-foreground text-xs">{unit}</span>
      </CardHeader>
      <CardContent>
        {data.length === 0 ?
          <div className="flex justify-center items-center border border-dashed rounded-lg min-h-40">
            <p className="text-muted-foreground text-sm">{empty}</p>
          </div>
        : <ChartContainer
            config={{ tonnes: { label: unit, color: "var(--chart-1)" } }}
            className="w-full aspect-video"
          >
            <BarChart
              data={data}
              margin={{ top: 20, left: 4, right: 8, bottom: 24 }}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
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
                width={36}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => n(v)}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => (
                      <span className="font-mono tabular-nums">
                        {n(Number(value))} t CO2e
                      </span>
                    )}
                  />
                }
              />
              <Bar
                dataKey="tonnes"
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
                isAnimationActive={false}
              >
                {data.map((d, index) => (
                  <Cell
                    key={`${index}-${d.name}`}
                    fill={SCOPE_COLOR[d.scope]}
                  />
                ))}
                <LabelList
                  dataKey="tonnes"
                  position="top"
                  className="fill-muted-foreground"
                  formatter={(value) => n(Number(value ?? 0))}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        }
      </CardContent>
    </Card>
  );
}
