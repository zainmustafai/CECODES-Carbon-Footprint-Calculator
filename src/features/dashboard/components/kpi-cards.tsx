"use client";

import { useFormatter, useTranslations } from "next-intl";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DashboardCurrent, TargetRow, YearTotal } from "../lib/types";

// The three headline KPIs, matching the mockup: the total footprint (honouring any scope or
// category refinement), the year-over-year change, and progress against the target.
export function KpiCards({
  current,
  previous,
  targets,
}: {
  current: DashboardCurrent;
  previous: YearTotal | null;
  targets: TargetRow[];
}) {
  const t = useTranslations("dashboard.kpi");
  const tScopes = useTranslations("dashboard.scopeNames");
  const format = useFormatter();

  const n = (value: number, digits = 1) =>
    format.number(value, { maximumFractionDigits: digits });

  // Headline caption: gross, or the active scope, or the active category.
  const totalCaption = current.totalCategoryLabel
    ? t("categoryEmissions", {
        category: current.totalCategoryLabel,
        year: String(current.year),
      })
    : current.totalScopeLabel
      ? t("scopeEmissions", {
          scope: tScopes(current.totalScopeLabel),
          year: String(current.year),
        })
      : t("grossEmissions", { year: String(current.year) });

  // Year over year compares the gross totals, independent of any scope/category refinement.
  const delta =
    previous && previous.tonnes > 0
      ? ((current.yearTotal - previous.tonnes) / previous.tonnes) * 100
      : null;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Total footprint */}
      <Card>
        <CardContent className="space-y-1 pt-6">
          <p className="text-sm text-muted-foreground">{t("total")}</p>
          <p className="font-mono text-4xl font-semibold tabular-nums">
            {n(current.total)}
            <span className="ml-1.5 text-base font-normal text-muted-foreground">tCO2e</span>
          </p>
          <p className="text-xs text-muted-foreground">{totalCaption}</p>
        </CardContent>
      </Card>

      {/* Variation vs previous year */}
      <Card>
        <CardContent className="space-y-1 pt-6">
          <p className="text-sm text-muted-foreground">{t("variation")}</p>
          {delta === null ? (
            <>
              <p className="flex items-center gap-1.5 font-mono text-4xl font-semibold tabular-nums text-muted-foreground">
                <Minus className="size-7" aria-hidden />
              </p>
              <p className="text-xs text-muted-foreground">{t("noPreviousYear")}</p>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <p
                  className={cn(
                    "font-mono text-4xl font-semibold tabular-nums",
                    delta <= 0 ? "text-primary" : "text-destructive",
                  )}
                >
                  {delta > 0 ? "+" : delta < 0 ? "-" : ""}
                  {n(Math.abs(delta))}%
                </p>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                    delta <= 0
                      ? "bg-primary/10 text-primary"
                      : "bg-destructive/10 text-destructive",
                  )}
                >
                  {delta <= 0 ? (
                    <ArrowDownRight className="size-3.5" aria-hidden />
                  ) : (
                    <ArrowUpRight className="size-3.5" aria-hidden />
                  )}
                  {delta <= 0 ? t("reduction") : t("increase")}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("variationBase", {
                  year: String(previous!.year),
                  tonnes: n(previous!.tonnes),
                })}
              </p>
              {previous!.incomplete ? (
                // The comparison year could not be fully priced (most often: no grid factor for
                // it). Its total is therefore too low, which shows up here as a flattering
                // "reduction". Say so, rather than let a hole in the data read as progress.
                <p className="text-xs text-chart-2">
                  {t("variationIncomplete", { year: String(previous!.year) })}
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {/* Target progress */}
      <TargetKpi targets={targets} />
    </div>
  );
}

function TargetKpi({ targets }: { targets: TargetRow[] }) {
  const t = useTranslations("dashboard.kpi");
  const format = useFormatter();
  const n = (value: number, digits = 1) =>
    format.number(value, { maximumFractionDigits: digits });

  if (targets.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-1 pt-6">
          <p className="text-sm text-muted-foreground">{t("target")}</p>
          <p className="flex items-center gap-1.5 font-mono text-4xl font-semibold tabular-nums text-muted-foreground">
            <Minus className="size-7" aria-hidden />
          </p>
          <p className="text-xs text-muted-foreground">{t("noTarget")}</p>
        </CardContent>
      </Card>
    );
  }

  const totalTarget = targets.reduce((s, r) => s + r.targetTonnes, 0);
  const totalActual = targets.reduce((s, r) => s + r.actualTonnes, 0);
  const pct = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0;
  const over = totalActual > totalTarget;

  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <p className="text-sm text-muted-foreground">{t("target")}</p>
        <p
          className={cn(
            "font-mono text-4xl font-semibold tabular-nums",
            over ? "text-destructive" : "text-primary",
          )}
        >
          {n(pct, 0)}%
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-primary")}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {over ? t("overTarget") : t("underTarget")} · {n(totalActual)} / {n(totalTarget)}{" "}
          tCO2e
        </p>
      </CardContent>
    </Card>
  );
}
