"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Cell, Label, Pie, PieChart } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import type { PortfolioStatus } from "../lib/load-admin-overview";

// Active companies split by where they are in the reporting cycle. Same shape as the company
// dashboard's ScopeDonut, so the admin home reads as part of the same product: a donut with a
// centered total and a labelled legend. Colours reuse the chart tokens (green = on track, amber
// = started, slate = nothing yet), never raw hex.
const STATUS_COLOR: Record<keyof PortfolioStatus, string> = {
  reporting: "var(--chart-1)",
  started: "var(--chart-2)",
  noData: "var(--chart-5)",
};

const ORDER: (keyof PortfolioStatus)[] = ["reporting", "started", "noData"];

export function PortfolioDonut({ portfolio }: { portfolio: PortfolioStatus }) {
  const t = useTranslations("admin.overview.portfolio");
  const format = useFormatter();
  const n = (value: number) => format.number(value);

  const total = portfolio.reporting + portfolio.started + portfolio.noData;
  const data = ORDER.map((key) => ({ key, value: portfolio[key] })).filter((d) => d.value > 0);

  return (
    <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
      {total === 0 ? (
        <div className="flex aspect-square w-full max-w-40 items-center justify-center rounded-full border border-dashed text-xs text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <ChartContainer config={{}} className="mx-auto aspect-square w-full max-w-40">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="key"
              innerRadius="62%"
              outerRadius="100%"
              paddingAngle={data.length > 1 ? 2 : 0}
              strokeWidth={0}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.key} fill={STATUS_COLOR[d.key]} />
              ))}
              <Label
                position="center"
                content={({ viewBox }) => {
                  if (!viewBox || !("cx" in viewBox)) return null;
                  const { cx, cy } = viewBox as { cx: number; cy: number };
                  return (
                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
                      <tspan x={cx} y={cy - 6} className="fill-foreground font-mono text-xl font-semibold">
                        {n(total)}
                      </tspan>
                      <tspan x={cx} y={cy + 14} className="fill-muted-foreground text-[11px]">
                        {t("activeCompanies")}
                      </tspan>
                    </text>
                  );
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
      )}

      <ul className="space-y-2.5">
        {ORDER.map((key) => (
          <li key={key} className="flex items-start gap-2.5">
            <span
              className="mt-1 size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: STATUS_COLOR[key] }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t(key)}</p>
              <p className="text-xs text-muted-foreground">{t(`${key}Hint`)}</p>
            </div>
            <p className="font-mono text-sm font-semibold tabular-nums">{n(portfolio[key])}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
