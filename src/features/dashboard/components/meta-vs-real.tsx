"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SCOPE_COLOR } from "../lib/chart";
import type { TargetRow } from "../lib/types";

// Meta vs. real per scope. Each row is a bar of the actual emissions against a dashed target
// marker. A reduction target is a ceiling, so an actual under it is good (green); over it is
// amber. When no target is set the card invites the user to set one rather than sitting empty.
export function MetaVsReal({
  targets,
  dataEntryHref,
}: {
  targets: TargetRow[];
  dataEntryHref: string;
}) {
  const t = useTranslations("dashboard.targets");
  const tScopes = useTranslations("dashboard.scopeNames");
  const format = useFormatter();

  const n = (value: number) => format.number(value, { maximumFractionDigits: 1 });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block h-0 w-4 border-t-2 border-dashed border-muted-foreground" />
          {t("meta")}
        </span>
      </CardHeader>
      <CardContent>
        {targets.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Target className="size-5" aria-hidden />
            </div>
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
            <Button asChild variant="outline" size="sm">
              <a href={dataEntryHref}>{t("cta")}</a>
            </Button>
          </div>
        ) : (
          <ul className="space-y-5">
            {targets.map((row) => {
              const over = row.actualTonnes > row.targetTonnes;
              // The bar scales to whichever is larger, so the target marker always sits on it.
              const scale = Math.max(row.actualTonnes, row.targetTonnes) || 1;
              const actualPct = (row.actualTonnes / scale) * 100;
              const targetPct = (row.targetTonnes / scale) * 100;
              return (
                <li key={row.scope} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">{tScopes(row.scope)}</span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      <span
                        className={cn(
                          "font-semibold",
                          over ? "text-destructive" : "text-foreground",
                        )}
                      >
                        {n(row.actualTonnes)}
                      </span>{" "}
                      / {t("meta")} {n(row.targetTonnes)}
                    </span>
                  </div>
                  <div className="relative h-3 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${actualPct}%`,
                        backgroundColor: over ? "var(--destructive)" : SCOPE_COLOR[row.scope],
                      }}
                    />
                    {/* The dashed target line sits above the bar at the target position. */}
                    <span
                      className="absolute inset-y-0 border-l-2 border-dashed border-foreground/70"
                      style={{ left: `calc(${targetPct}% - 1px)` }}
                      aria-hidden
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
