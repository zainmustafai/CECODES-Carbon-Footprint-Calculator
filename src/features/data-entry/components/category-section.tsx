"use client";

import { useEffect, useRef, useState } from "react";
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
  /** The scope panel's shared format hint. Every field here points at it. */
  hintId?: string;
  /** The panel banner already states the missing grid factor; sources state it short. */
  gridWarningShown?: boolean;
};

// A category is either carrying data or it is not, and the two deserve very different amounts of
// the screen. A category with sources is a card you work inside. An empty one is a single line:
// its name, whether it applies, and a way to add the first source. Most of the taxonomy is empty
// for any given company, and rendering all of it as full cards buried the handful that matter
// under a wall of chrome.
//
// Nothing is hidden. "¿Aplica?" stays reachable on the compact row, because "no aplica" is
// reportable data: the GHG standard requires a company to declare the categories it excludes.
export function CategorySection({
  category,
  factorCategory,
  gridFactor,
  gwpSet,
  year,
  hintId,
  gridWarningShown,
}: CategorySectionProps) {
  const t = useTranslations("dataEntry.category");
  const { setApplies, isPending } = useSourceActions();

  // Deleting a source unmounts its row, and with it the focused delete button, which would drop
  // focus onto <body>. "Agregar fuente" is the one element that survives, so focus goes there.
  //
  // It cannot be focused inline. Adding the FIRST source turns this section from a one-line row
  // into a card, and deleting the LAST one turns it back, and either way the trigger remounts in
  // the other branch. The callback fires while the old node is still on screen, so focusing right
  // then would focus an element that is about to be unmounted, and focus would land on <body>.
  // The request is recorded instead, and honoured in an effect once the new tree has committed
  // and the ref points at the node that actually exists.
  const addSourceRef = useRef<HTMLButtonElement>(null);
  const wantsFocus = useRef(false);
  const focusAddSource = () => {
    wantsFocus.current = true;
  };

  useEffect(() => {
    if (!wantsFocus.current) return;
    const trigger = addSourceRef.current;
    if (!trigger) return;
    wantsFocus.current = false;
    trigger.focus();
  });

  // domId: category names carry spaces and accents, and a raw name inside an id breaks the
  // idrefs that aria-describedby depends on.
  const switchId = domId("applies", category.scope, category.category);
  const lockedId = domId("locked", category.scope, category.category);
  const naId = domId("na", category.scope, category.category);

  const hasSources = category.sources.length > 0;
  const monthly = isMonthly(category.scope);

  // The server prop only changes after the refresh lands, so without an optimistic value the
  // switch thumb would sit frozen for the whole round trip and read as broken.
  const [optimisticApplies, setOptimisticApplies] = useState<boolean | null>(null);
  const applies = optimisticApplies ?? category.applies;

  // Derived, NOT frozen at mount. "Agregar fuente" is now reachable from the collapsed empty
  // row, so a source can arrive while the section is closed. A useState initialiser would keep
  // `open` false through that re-render and the brand new source would be invisible. An explicit
  // user toggle still wins; otherwise the section follows the data.
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const open = openOverride ?? hasSources;

  // Turning a category off would otherwise mean deleting recorded consumption behind a switch.
  // Remove its sources first; the server refuses either way.
  const lockSwitch = hasSources || isPending;

  function onAppliesChange(next: boolean) {
    setOptimisticApplies(next);
    void setApplies(category.scope, category.category, next).then((ok) => {
      // On failure snap back; on success hold the optimistic value until the refreshed server
      // prop takes over (clearing early would flicker the old state back in).
      if (!ok) setOptimisticApplies(null);
    });
  }

  // ---------------------------------------------------------------------------
  // Empty category: one line, not a card.
  // ---------------------------------------------------------------------------
  if (!hasSources) {
    return (
      <section className="flex scroll-mt-24 flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">
          {category.category}
        </h2>

        {applies ? (
          // NOT text-muted-foreground/70: at 12px that lands on 3.13:1, under the 4.5:1 AA floor
          // for small text. --muted-foreground is already tuned to pass at full opacity; dimming
          // it further to look "quieter" is exactly how this screen failed axe.
          <span className="shrink-0 text-xs text-muted-foreground">
            {t("noSourcesShort")}
          </span>
        ) : (
          <Badge variant="outline" className="shrink-0">
            {t("notApplicableShort")}
          </Badge>
        )}

        <div
          className="flex shrink-0 items-center gap-2"
          aria-busy={isPending || undefined}
        >
          {/* No room for a visible "¿Aplica?" label on one line, so the switch names itself. */}
          <Switch
            id={switchId}
            checked={applies}
            disabled={isPending}
            aria-label={t("appliesAria", { category: category.category })}
            aria-describedby={applies ? undefined : naId}
            onCheckedChange={onAppliesChange}
          />
          {applies ? (
            <AddSourceDialog
              ref={addSourceRef}
              category={factorCategory}
              existingFactorIds={[]}
              onAdded={focusAddSource}
            />
          ) : null}
        </div>

        {applies ? null : (
          <p id={naId} className="sr-only">
            {t("notApplicable")}
          </p>
        )}
      </section>
    );
  }

  // ---------------------------------------------------------------------------
  // Category with data: the working card.
  // ---------------------------------------------------------------------------
  return (
    // scroll-mt keeps a keyboard-focused row from being scrolled underneath the sticky
    // context bar.
    <section className="scroll-mt-24 rounded-lg border">
      <Collapsible open={open} onOpenChange={setOpenOverride}>
        <div className="flex flex-wrap items-center gap-3 p-4">
          {/* Full width on a phone so the category name never truncates; shares the row from sm.
              The heading wraps the trigger so the page has a navigable outline (h1 > h2). */}
          <h2 className="-ml-2 w-full min-w-0 sm:w-auto sm:flex-1">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                // The ghost variant fills on aria-expanded, which suits a dropdown trigger but
                // paints a stray bar across an open section header.
                className="w-full min-w-0 justify-start aria-expanded:bg-transparent"
              >
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 transition-transform",
                    open && "rotate-180",
                  )}
                  aria-hidden
                />
                <span className="truncate text-base font-semibold">{category.category}</span>
              </Button>
            </CollapsibleTrigger>
          </h2>

          <div className="flex w-full shrink-0 items-center justify-end gap-3 sm:w-auto">
            <Badge variant="secondary" className="tabular-nums">
              {t("sourceCount", { count: category.sources.length })}
            </Badge>
            <div className="flex items-center gap-2" aria-busy={isPending || undefined}>
              <label htmlFor={switchId} className="text-xs text-muted-foreground">
                {t("applies")}
              </label>
              {/* The switch is always locked here (the category has sources). A Tooltip cannot
                  be reached by keyboard on a disabled control, so the reason is also an sr-only
                  paragraph wired through aria-describedby. */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Switch
                      id={switchId}
                      checked={applies}
                      disabled={lockSwitch}
                      aria-describedby={lockedId}
                      onCheckedChange={onAppliesChange}
                    />
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t("lockedBySources")}</TooltipContent>
              </Tooltip>
              <p id={lockedId} className="sr-only">
                {t("lockedBySources")}
              </p>
            </div>
          </div>
        </div>

        <CollapsibleContent>
          <div className="border-t px-4 pb-4">
            <div className="mb-3">
              {category.sources.map((source) =>
                monthly ? (
                  <MonthlySourceRow
                    key={source.emissionFactorId}
                    source={source}
                    gridFactor={gridFactor}
                    gwpSet={gwpSet}
                    year={year}
                    hintId={hintId}
                    gridWarningShown={gridWarningShown}
                    // A single monthly source is what the user came to fill in: opening it for
                    // them removes the guess that the row expands.
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
            </div>

            <AddSourceDialog
              ref={addSourceRef}
              category={factorCategory}
              existingFactorIds={category.sources.map((s) => s.emissionFactorId)}
              onAdded={focusAddSource}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
