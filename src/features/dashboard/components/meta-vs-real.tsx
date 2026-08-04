"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CompanyTargetProgress } from "../lib/types";

// The company's single reduction goal against its actual progress: one bar (the current year's
// company-wide total) against a dashed marker (the tonnes the goal implies), both measured from
// the baseline year. A reduction target is a ceiling on the current total, so under it is good
// (primary); over it is off track (destructive). When no target is set the card invites the
// user to set one, on the Empresa screen now rather than Data Entry.
export function MetaVsReal({
  target,
  companyProfileHref,
}: {
  target: CompanyTargetProgress | null;
  companyProfileHref: string;
}) {
  const t = useTranslations("dashboard.targets");
  const format = useFormatter();

  const n = (value: number) => format.number(value, { maximumFractionDigits: 1 });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{t("title")}</CardTitle>
        {target ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-0 w-4 border-t-2 border-dashed border-muted-foreground" />
            {t("meta")}
          </span>
        ) : null}
      </CardHeader>
      <CardContent>
        {!target ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Target className="size-5" aria-hidden />
            </div>
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
            <Button asChild variant="outline" size="sm">
              <a href={companyProfileHref}>{t("cta")}</a>
            </Button>
          </div>
        ) : (
          (() => {
            // The tonnes implied by "reduce reductionPct% from the baseline year".
            const targetTonnes = target.baselineTonnes * (1 - target.reductionPct / 100);
            const over = target.currentTonnes > targetTonnes;
            const scale = Math.max(target.currentTonnes, targetTonnes, target.baselineTonnes) || 1;
            const currentPct = (target.currentTonnes / scale) * 100;
            const targetPct = (targetTonnes / scale) * 100;

            return (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{String(target.currentYear)}</span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    <span
                      className={cn("font-semibold", over ? "text-destructive" : "text-foreground")}
                    >
                      {n(target.currentTonnes)}
                    </span>{" "}
                    / {t("meta")} {n(targetTonnes)} tCO2e
                  </span>
                </div>
                <div className="relative h-3 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${currentPct}%`,
                      backgroundColor: over ? "var(--destructive)" : "var(--primary)",
                    }}
                  />
                  <span
                    className="absolute inset-y-0 border-l-2 border-dashed border-foreground/70"
                    style={{ left: `calc(${targetPct}% - 1px)` }}
                    aria-hidden
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("baselineCaption", {
                    pct: n(target.reductionPct),
                    year: String(target.baselineYear),
                    tonnes: n(target.baselineTonnes),
                  })}
                </p>
              </div>
            );
          })()
        )}
      </CardContent>
    </Card>
  );
}
