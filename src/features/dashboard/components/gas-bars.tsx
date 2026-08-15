"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { GasBreakdown } from "../lib/types";

// Emissions by gas: CO2/CH4/N2O first (a small, fixed set, so they stay in the same order every
// time), then one row per named "other" gas the factor library identifies (SF6, PFC, HFC, NF3,
// ...) plus a fallback row for whatever is still unidentified - client feedback 2026-08-15:
// "please include all of the gases separately... specify those 'other' such SF6, NF3, etc."
// CSS bars, same reasoning as CategoryBars: the values are already known, a div reads crisper
// than a chart-library axis.
//
// Color: chart-1/2/3 are reserved for Alcance everywhere else in the product (see chart.ts) -
// reusing them here would make a reader who has learned "green = Alcance 1" misread a green CO2
// bar as something scope-related. Real per-gas rows render in one neutral accent (bg-primary);
// EVERY "other" row (named or fallback) renders visibly muted, which doubles as a passive cue
// that it is still an aggregate/estimate - a named gasType tells you WHICH gas it is, not how
// much of it is CO2/CH4/N2O-equivalent by mechanism, so it keeps the same honestly-caveated
// styling the biogenic/removals notes already use elsewhere on this dashboard.
export function GasBars({ breakdown }: { breakdown: GasBreakdown }) {
  const t = useTranslations("dashboard.byGas");
  const tGas = useTranslations("dashboard.gasNames");
  const format = useFormatter();

  const max = [...breakdown.slices, ...breakdown.otherGases].reduce(
    (m, s) => Math.max(m, s.tonnes),
    0,
  );
  const hasAny =
    breakdown.slices.some((s) => s.tonnes > 0) || breakdown.otherGases.some((s) => s.tonnes > 0);
  const otherTonnes = breakdown.otherGases.reduce((sum, s) => sum + s.tonnes, 0);

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
            {breakdown.slices.map((s) => (
              <GasRow key={s.gas} label={tGas(s.gas)} tonnes={s.tonnes} pct={s.pct} max={max} muted={false} format={format} />
            ))}
            {breakdown.otherGases.map((s) => (
              <GasRow
                key={s.gasType}
                label={s.isFallback ? tGas("OTHER") : s.gasType}
                tonnes={s.tonnes}
                pct={s.pct}
                max={max}
                muted
                format={format}
              />
            ))}
          </ul>
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

// One bar row, shared by the CO2/CH4/N2O slices and the named/fallback "other gas" rows - the
// only difference between them is `muted` (see the file comment above).
function GasRow({
  label,
  tonnes,
  pct,
  max,
  muted,
  format,
}: {
  label: string;
  tonnes: number;
  pct: number;
  max: number;
  muted: boolean;
  format: ReturnType<typeof useFormatter>;
}) {
  return (
    <li className="space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <span className={cn("text-sm", muted && "text-muted-foreground")}>{label}</span>
        <div className="shrink-0 text-right">
          <p
            className={cn(
              "font-mono text-sm font-semibold tabular-nums",
              muted && "font-normal text-muted-foreground",
            )}
          >
            {format.number(tonnes, { maximumFractionDigits: 1 })}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {format.number(pct, { maximumFractionDigits: 1 })}%
          </p>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-[width]", muted ? "bg-muted-foreground/50" : "bg-primary")}
          style={{
            width: `${max > 0 ? Math.max((tonnes / max) * 100, tonnes > 0 ? 1.5 : 0) : 0}%`,
          }}
        />
      </div>
    </li>
  );
}
