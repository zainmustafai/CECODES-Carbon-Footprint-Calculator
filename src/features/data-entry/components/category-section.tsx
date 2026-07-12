"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { GwpSet } from "@/lib/generated/prisma/client";
import type { PreviewGridFactor } from "@/lib/calc/preview";
import type { CategoryVM, FactorCategory } from "../lib/types";
import { isMonthly } from "../lib/months";
import { domId } from "../lib/dom-id";
import { useSourceActions } from "../hooks/use-source-actions";
import { AddSourceDialog } from "./add-source-dialog";
import { MonthlySourceRow } from "./monthly-source-row";
import { SourceRow } from "./source-row";

type CategorySectionProps = {
  category: CategoryVM;
  factorCategory: FactorCategory | undefined;
  gridFactor: PreviewGridFactor | null;
  gwpSet: GwpSet;
  year: number;
};

export function CategorySection({
  category,
  factorCategory,
  gridFactor,
  gwpSet,
  year,
}: CategorySectionProps) {
  const t = useTranslations("dataEntry.category");
  const tv = useTranslations("dataEntry");
  const [open, setOpen] = useState(category.sources.length > 0);
  const { setApplies, isPending } = useSourceActions();

  // Deleting a source unmounts its row, and with it the focused delete button, which would
  // drop focus onto <body>. "Agregar fuente" is the one element in this section that always
  // survives the refresh, so focus goes there.
  const addSourceRef = useRef<HTMLButtonElement>(null);
  const focusAddSource = () => addSourceRef.current?.focus();

  // domId: category names carry spaces and accents, and a raw name inside an id breaks the
  // aria-describedby idrefs pointing at the shared hint.
  const hintId = domId("hint", category.scope, category.category);
  const switchId = domId("applies", category.scope, category.category);

  const hasSources = category.sources.length > 0;
  const monthly = isMonthly(category.scope);

  // The server prop only changes after the refresh lands, so without an optimistic value the
  // switch thumb would sit frozen for the whole round trip and read as broken.
  const [optimisticApplies, setOptimisticApplies] = useState<boolean | null>(null);
  const applies = optimisticApplies ?? category.applies;

  // Turning a category off would otherwise mean deleting recorded consumption behind a
  // switch. Remove its sources first; the server refuses either way.
  const lockSwitch = hasSources || isPending;

  const appliesSwitch = (
    <Switch
      id={switchId}
      checked={applies}
      disabled={lockSwitch}
      onCheckedChange={(next) => {
        setOptimisticApplies(next);
        void setApplies(category.scope, category.category, next).then((ok) => {
          // On failure snap back; on success hold the optimistic value until the refreshed
          // server prop takes over (clearing early would flicker the old state back in).
          if (!ok) setOptimisticApplies(null);
        });
      }}
    />
  );

  return (
    // scroll-mt keeps a keyboard-focused row from being scrolled underneath the sticky
    // context bar.
    <section className="scroll-mt-24 rounded-lg border">
      <Collapsible open={applies && open} onOpenChange={setOpen}>
        <div className="flex flex-wrap items-center gap-3 p-4">
          {/* Full width on a phone so the category name never truncates; shares the row from sm.
              The heading wraps the trigger so the page has a navigable outline (h1 > h2). */}
          <h2 className="-ml-2 w-full min-w-0 sm:w-auto sm:flex-1">
            <CollapsibleTrigger asChild disabled={!applies}>
              <Button
                variant="ghost"
                size="sm"
                // The ghost variant fills on aria-expanded, which suits a dropdown trigger but
                // paints a stray bar across an open section header.
                className="w-full min-w-0 justify-start aria-expanded:bg-transparent"
                disabled={!applies}
              >
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 transition-transform",
                    applies && open && "rotate-180",
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    "truncate text-base",
                    // Categories with data carry the weight; empty ones recede so the eye
                    // lands on real content instead of a wall of equal headers.
                    hasSources ? "font-semibold" : "font-medium text-muted-foreground",
                  )}
                >
                  {category.category}
                </span>
                {!hasSources && applies ? (
                  <span className="ml-1 hidden text-xs font-normal text-muted-foreground/70 sm:inline">
                    {t("noSourcesShort")}
                  </span>
                ) : null}
              </Button>
            </CollapsibleTrigger>
          </h2>

          <div className="flex w-full shrink-0 items-center justify-end gap-3 sm:w-auto">
            {hasSources ? (
              <Badge variant="secondary" className="tabular-nums">
                {t("sourceCount", { count: category.sources.length })}
              </Badge>
            ) : null}
            <div className="flex items-center gap-2" aria-busy={isPending || undefined}>
              <label htmlFor={switchId} className="text-xs text-muted-foreground">
                {t("applies")}
              </label>
              {lockSwitch && hasSources ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>{appliesSwitch}</span>
                  </TooltipTrigger>
                  <TooltipContent>{t("lockedBySources")}</TooltipContent>
                </Tooltip>
              ) : (
                appliesSwitch
              )}
            </div>
          </div>
        </div>

        {applies ? null : (
          <p className="border-t px-4 py-3 text-sm text-muted-foreground">
            {t("notApplicable")}
          </p>
        )}

        <CollapsibleContent>
          <div className="border-t px-4 pb-4">
            {hasSources ? (
              <div className="mb-3">
                {category.sources.map((source) =>
                  monthly ? (
                    <MonthlySourceRow
                      key={source.emissionFactorId}
                      source={source}
                      gridFactor={gridFactor}
                      gwpSet={gwpSet}
                      year={year}
                      // A single monthly source is what the user came to fill in: opening it
                      // for them removes the guess that the row expands.
                      defaultOpen={category.sources.length === 1}
                      onDeleted={focusAddSource}
                    />
                  ) : (
                    <SourceRow
                      key={source.emissionFactorId}
                      source={source}
                      gridFactor={gridFactor}
                      gwpSet={gwpSet}
                      year={year}
                      hintId={hintId}
                      onDeleted={focusAddSource}
                    />
                  ),
                )}
                {/* One shared format hint per category. Every annual field points at it
                    through aria-describedby; the month grid carries its own. */}
                {monthly ? null : (
                  <p id={hintId} className="pt-1 text-xs text-muted-foreground">
                    {tv("valueHint")}
                  </p>
                )}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t("noSources")}
              </p>
            )}

            <AddSourceDialog
              ref={addSourceRef}
              category={factorCategory}
              existingFactorIds={category.sources.map((s) => s.emissionFactorId)}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
