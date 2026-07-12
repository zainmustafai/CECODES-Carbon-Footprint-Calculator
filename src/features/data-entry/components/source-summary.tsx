"use client";

import { useFormatter, useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import type { GwpSet } from "@/lib/generated/prisma/client";
import type { PreviewGridFactor } from "@/lib/calc/preview";
import { cn } from "@/lib/utils";
import { useSourceEstimate } from "../hooks/use-source-estimate";
import type { SourceVM } from "../lib/types";

// "Resumen del elemento": the estimated emissions of one source, live as the user types,
// plus the factor that produced them.
//
// It is explicitly labelled an estimate. The authoritative totals come from the engine and
// land on the dashboard. When a factor is missing it says so, rather than showing 0.0 t,
// which would be indistinguishable from a company that emitted nothing.
export function SourceSummary({
  source,
  gridFactor,
  gwpSet,
  year,
  variant = "card",
  className,
}: {
  source: SourceVM;
  gridFactor: PreviewGridFactor | null;
  gwpSet: GwpSet;
  year: number;
  /** "card" for the Scope 2 month grid rail; "compact" for a single annual row. */
  variant?: "card" | "compact";
  className?: string;
}) {
  const t = useTranslations("dataEntry.summary");
  const format = useFormatter();
  const estimate = useSourceEstimate({ source, gridFactor, gwpSet });

  if (estimate.kind !== "ok") {
    return (
      <div
        role="status"
        className={cn(
          "flex items-start gap-2 rounded-lg border border-chart-2/40 bg-chart-2/5 p-3",
          className,
        )}
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-chart-2" aria-hidden />
        <p className="text-xs text-muted-foreground">
          {estimate.kind === "missingGridFactor"
            ? // String, not number: ICU would render 2020 as "2.020".
              t("missingGridFactor", { year: String(year) })
            : t("noFactor")}
        </p>
      </div>
    );
  }

  // An estimate over zero reported values is not "0 t CO2e": nothing has been reported.
  const tonnes = estimate.hasValues
    ? format.number(estimate.tonnes, { maximumFractionDigits: 2 })
    : null;

  // "Factor aplicado: kg CO2/gal" without the number told the user nothing. The value is
  // what lets them audit the estimate against the factor library or the Excel.
  const factorLabel = [
    estimate.factorValue !== null
      ? format.number(Number(estimate.factorValue), { maximumFractionDigits: 4 })
      : null,
    estimate.factorUnit,
  ]
    .filter(Boolean)
    .join(" ");

  // One annual value does not deserve a whole card beside it.
  if (variant === "compact") {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        <span className="font-medium">{t("estimated")}:</span>{" "}
        <span className="font-mono tabular-nums text-foreground">
          {tonnes !== null ? `${tonnes} t CO2e` : t("notReportedYet")}
        </span>
        {factorLabel ? (
          <span className="ml-2 whitespace-nowrap">
            {t("factorApplied")}: <span className="font-mono">{factorLabel}</span>
          </span>
        ) : null}
        <span className="ml-2 whitespace-nowrap">
          {t("gwpSet")}: <span className="font-mono">{gwpSet}</span>
        </span>
      </p>
    );
  }

  return (
    <div className={cn("rounded-lg border bg-muted/30 p-3", className)}>
      <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
        {t("estimated")}
      </p>
      {tonnes !== null ? (
        <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
          {tonnes}
          <span className="ml-1 text-sm font-normal text-muted-foreground">t CO2e</span>
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{t("notReportedYet")}</p>
      )}

      <dl className="mt-3 space-y-1 text-xs">
        {factorLabel ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("factorApplied")}</dt>
            <dd className="text-right font-mono">{factorLabel}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t("gwpSet")}</dt>
          <dd className="text-right font-mono">{gwpSet}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t("factorSource")}</dt>
          <dd className="text-right">{estimate.factorSource ?? t("unknownSource")}</dd>
        </div>
      </dl>

      <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">{t("note")}</p>
    </div>
  );
}
