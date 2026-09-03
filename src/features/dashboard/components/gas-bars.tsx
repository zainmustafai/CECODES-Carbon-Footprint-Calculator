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

// "Participación por GEI en el inventario total": the share each greenhouse gas holds, over a
// FIXED set of columns in the client's own order (CO2, CH4 no fósil, CH4 fósil, N2O, HFCs, PFCs,
// SF6, NF3), with the percentage table underneath that their chart prints.
//
// Client feedback 2026-09-03: "do not display 'other' but show all of the gases separately (even
// SF3 [SF6], CHF [HFC], etc.)" and "break down by each gas and please show the difference between
// fossil and non-fossil CH4. The difference here is the biogenic." The columns are fixed rather
// than derived from the data precisely so a gas reading 0,00% still appears: an inventory that
// silently omits SF6 reads as "we did not measure it", which is a different claim from zero.
//
// The one column that is ours and not theirs is "sin identificar", shown only when it holds
// something: a pre-blended factor whose gas the library never captured has to land somewhere, and
// folding it into a named gas would be a quiet lie.
//
// Colour: chart-1/2/3 are reserved for Alcance everywhere else in the product (see chart.ts), so
// reusing them here would make a reader who has learned "green = Alcance 1" misread this as
// scope-related. chart-4 is free for exactly this kind of single, unscoped series.
export function GasBars({ breakdown }: { breakdown: GasBreakdown }) {
  const t = useTranslations("dashboard.byGas");
  const tGas = useTranslations("dashboard.gasNames");
  const tUnit = useTranslations("dashboard");
  const format = useFormatter();

  const hasAny = breakdown.slices.some((s) => s.tonnes !== 0);

  const data = breakdown.slices.map((s) => ({
    gas: tGas(s.gas),
    tonnes: s.tonnes,
    pct: s.pct,
  }));

  const n = (value: number, digits: number) =>
    format.number(value, { maximumFractionDigits: digits, minimumFractionDigits: digits });

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
        {hasAny ? (
          <>
            <ChartContainer
              config={{ pct: { label: t("share"), color: "var(--chart-4)" } }}
              className="aspect-16/6 w-full"
            >
              <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="gasFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-pct)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-pct)" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="gas"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  interval={0}
                />
                <YAxis
                  width={44}
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${format.number(v, { maximumFractionDigits: 0 })}%`}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelKey="gas"
                      formatter={(value, _name, item) => (
                        <span className="font-mono tabular-nums">
                          {format.number(Number(value), { maximumFractionDigits: 2 })}%
                          <span className="ml-2 text-muted-foreground">
                            {format.number(Number(item?.payload?.tonnes ?? 0), {
                              maximumFractionDigits: 2,
                            })}{" "}
                            t CO2e
                          </span>
                        </span>
                      )}
                    />
                  }
                />
                <Area
                  dataKey="pct"
                  type="linear"
                  stroke="var(--color-pct)"
                  strokeWidth={2}
                  fill="url(#gasFill)"
                  isAnimationActive={false}
                  dot={{ r: 3, fill: "var(--color-pct)", strokeWidth: 0 }}
                />
              </AreaChart>
            </ChartContainer>

            {/* The client's own chart prints the numbers under the plot rather than relying on a
                tooltip, because this table is what gets read into a report. */}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-max border-collapse text-xs">
                <caption className="sr-only">{t("title")}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="sr-only">
                      {t("gasColumn")}
                    </th>
                    {data.map((d) => (
                      <th
                        key={d.gas}
                        scope="col"
                        className="border-b px-2 py-1.5 text-left font-medium text-muted-foreground"
                      >
                        {d.gas}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  <tr>
                    <th
                      scope="row"
                      className="whitespace-nowrap py-1.5 pr-3 text-left font-medium"
                    >
                      {t("share")}
                    </th>
                    {data.map((d) => (
                      <td key={d.gas} className="px-2 py-1.5">
                        {n(d.pct, 2)}%
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th
                      scope="row"
                      className="whitespace-nowrap py-1.5 pr-3 text-left font-medium"
                    >
                      {tUnit("tCo2e")}
                    </th>
                    {data.map((d) => (
                      <td key={d.gas} className="px-2 py-1.5 text-muted-foreground">
                        {n(d.tonnes, 2)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {breakdown.otherEntries > 0 ? (
              <p className="mt-3 text-muted-foreground text-xs">
                {t("preBlendedNote", { count: breakdown.otherEntries })}
              </p>
            ) : null}
          </>
        ) : (
          <div className="flex aspect-16/6 items-center justify-center rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
