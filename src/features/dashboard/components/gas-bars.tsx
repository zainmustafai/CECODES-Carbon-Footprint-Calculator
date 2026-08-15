"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { GasBreakdown } from "../lib/types";

// Emissions by gas: a small, fixed set (CO2, CH4, N2O, plus an honestly-disclosed OTHER bucket),
// so rows stay in the same order every time rather than re-ranking like CategoryBars does for its
// open-ended list. CSS bars, same reasoning as CategoryBars: the values are already known, a div
// reads crisper than a chart-library axis.
//
// Color: chart-1/2/3 are reserved for Alcance everywhere else in the product (see chart.ts) - reusing
// them here would make a reader who has learned "green = Alcance 1" misread a green CO2 bar as
// something scope-related. Real gases render in one neutral accent (bg-primary); OTHER renders
// visibly muted, which doubles as a passive cue that it is an aggregate, not a measured split -
// the same "muted means honestly-caveated" convention the biogenic/removals notes already use.
export function GasBars({ breakdown }: { breakdown: GasBreakdown }) {
  const t = useTranslations("dashboard.byGas");
  const tGas = useTranslations("dashboard.gasNames");
  const format = useFormatter();

  const max = breakdown.slices.reduce((m, s) => Math.max(m, s.tonnes), 0);
  const hasAny = breakdown.slices.some((s) => s.tonnes > 0);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <span className="text-xs text-muted-foreground">tCO2e</span>
      </CardHeader>
      <CardContent>
        {!hasAny ? (
          <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          </div>
        ) : (
          <ul className="space-y-3.5">
            {breakdown.slices.map((s) => {
              const isOther = s.gas === "OTHER";
              return (
                <li key={s.gas} className="space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={cn("text-sm", isOther && "text-muted-foreground")}
                    >
                      {tGas(s.gas)}
                    </span>
                    <div className="shrink-0 text-right">
                      <p
                        className={cn(
                          "font-mono text-sm font-semibold tabular-nums",
                          isOther && "font-normal text-muted-foreground",
                        )}
                      >
                        {format.number(s.tonnes, { maximumFractionDigits: 1 })}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {format.number(s.pct, { maximumFractionDigits: 1 })}%
                      </p>
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width]",
                        isOther ? "bg-muted-foreground/50" : "bg-primary",
                      )}
                      style={{
                        width: `${max > 0 ? Math.max((s.tonnes / max) * 100, s.tonnes > 0 ? 1.5 : 0) : 0}%`,
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {breakdown.otherEntries > 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("otherNote", {
              tonnes: format.number(
                breakdown.slices.find((s) => s.gas === "OTHER")?.tonnes ?? 0,
                { maximumFractionDigits: 1 },
              ),
              pct: format.number(breakdown.otherPct, { maximumFractionDigits: 1 }),
              count: breakdown.otherEntries,
            })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
