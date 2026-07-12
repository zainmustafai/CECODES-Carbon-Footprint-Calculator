"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SCOPE_COLOR } from "../lib/chart";
import type { CategorySlice } from "../lib/types";

// Emissions by category, as a ranked horizontal bar list. CSS bars, not a chart library: the
// values are already sorted and the bars are pure proportion, so a div reads crisper and
// theme-aware than a Recharts axis would. Each bar takes its scope colour, tying a category
// back to its alcance at a glance.
export function CategoryBars({ slices }: { slices: CategorySlice[] }) {
  const t = useTranslations("dashboard.byCategory");
  const tUnit = useTranslations("dashboard");
  const format = useFormatter();

  const max = slices.reduce((m, s) => Math.max(m, s.tonnes), 0);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <span className="text-xs text-muted-foreground">{tUnit("tCo2e")}</span>
      </CardHeader>
      <CardContent>
        {slices.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          </div>
        ) : (
          <ul className="space-y-3.5">
            {slices.map((s) => (
              <li key={`${s.scope}:${s.category}`} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm" title={s.category}>
                    {s.category}
                  </span>
                  <span className="shrink-0 font-mono text-sm tabular-nums">
                    {format.number(s.tonnes, { maximumFractionDigits: 1 })}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-[width]"
                    style={{
                      width: `${max > 0 ? Math.max((s.tonnes / max) * 100, 1.5) : 0}%`,
                      backgroundColor: SCOPE_COLOR[s.scope],
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
