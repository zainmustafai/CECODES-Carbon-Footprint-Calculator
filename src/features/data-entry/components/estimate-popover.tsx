"use client";

import { useFormatter, useTranslations } from "next-intl";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { GwpSet } from "@/lib/generated/prisma/client";
import type { PreviewGridFactor } from "@/lib/calc/preview";
import { useSourceEstimate } from "../hooks/use-source-estimate";
import type { SourceVM } from "../lib/types";
import { SourceSummary } from "./source-summary";

// The estimated emissions of an annual source, shown on the row, with everything that explains
// them one click away.
//
// The number stays visible because it is the answer the user is looking for. The provenance
// (which factor, which GWP set, which bibliographic source, and the "this is only an estimate"
// note) moves into the popover, because three labelled facts strung across the row buried the
// input the user actually came to fill in.
//
// A Popover, not a Tooltip. Everything in here has to be reachable by keyboard, and in this
// codebase a Tooltip only ever explains why a control is in a state, it never carries a datum.
//
// The hook runs here, at the top level, and the summary body below is presentational: the
// PopoverContent only mounts when open, so a hook inside it would come and go with the popover.
export function EstimatePopover({
  source,
  gridFactor,
  gwpSet,
  year,
}: {
  source: SourceVM;
  gridFactor: PreviewGridFactor | null;
  gwpSet: GwpSet;
  year: number;
}) {
  const t = useTranslations("dataEntry.summary");
  const format = useFormatter();
  const estimate = useSourceEstimate({ source, gridFactor, gwpSet });

  const warn = estimate.kind !== "ok";
  const label =
    estimate.kind === "missingGridFactor"
      ? t("missingGridFactorShort")
      : estimate.kind === "noFactor"
        ? t("noFactorShort")
        : estimate.hasValues
          ? `${format.number(estimate.tonnes, { maximumFractionDigits: 2 })} t CO2e`
          : t("notReportedYet");

  return (
    <Popover>
      <PopoverTrigger asChild>
        {/* The sr-only prefix is what gives the button its name: "Emisiones estimadas: 24,5 t
            CO2e". Without it the accessible name would be a bare number. */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 max-w-[11rem] gap-1 px-2 font-mono text-xs tabular-nums"
        >
          {warn ? (
            <AlertTriangle className="size-3.5 shrink-0 text-chart-2" aria-hidden />
          ) : null}
          <span className="sr-only">{t("estimated")}: </span>
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 gap-3" aria-label={t("title")}>
        <div>
          <PopoverTitle>{source.element}</PopoverTitle>
          {source.subcategory ? (
            <PopoverDescription>{source.subcategory}</PopoverDescription>
          ) : null}
        </div>
        <SourceSummary
          estimate={estimate}
          gwpSet={gwpSet}
          year={year}
          className="border-0 bg-transparent p-0"
        />
      </PopoverContent>
    </Popover>
  );
}
