"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { GwpSet, Scope } from "@/lib/generated/prisma/client";
import type { PreviewGridFactor } from "@/lib/calc/preview";
import { findCategory } from "../lib/group-factors";
import { domId } from "../lib/dom-id";
import type { GroupedFactors, ScopeVM } from "../lib/types";
import { CategorySection } from "./category-section";
import { ScopeToolbar } from "./scope-toolbar";

type ScopeTabsProps = {
  scopes: ScopeVM[];
  grouped: GroupedFactors;
  /** The reporting year has no national grid factor, so Scope 2 cannot be computed yet. */
  missingGridFactorYear: number | null;
  gridFactor: PreviewGridFactor | null;
  gwpSet: GwpSet;
  year: number;
  /** Saved reduction targets, keyed by scope. Absent means no target was set. */
  targets: Record<string, string>;
};

const SCOPES: Scope[] = ["SCOPE_1", "SCOPE_2", "SCOPE_3"];

export function ScopeTabs({
  scopes,
  grouped,
  missingGridFactorYear,
  gridFactor,
  gwpSet,
  year,
  targets,
}: ScopeTabsProps) {
  const t = useTranslations("dataEntry");
  const searchParams = useSearchParams();

  // The open tab survives a reload and lands in a shared link. The URL updates shallowly
  // (native replaceState, no server round trip), so switching tabs stays instant; a returning
  // user who was filling in electricity comes back to Alcance 2, not to the default.
  const scopeParam = searchParams.get("scope");
  const initialScope = SCOPES.includes(scopeParam as Scope) ? (scopeParam as Scope) : "SCOPE_1";

  function rememberScope(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("scope", value);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }

  return (
    <Tabs defaultValue={initialScope} onValueChange={rememberScope} className="gap-6">
      {/* The wrapper scrolls so three tabs plus badges never force the page sideways on a
          narrow phone. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <TabsList variant="line">
          {scopes.map((scope) => {
            const sources = scope.categories.reduce((n, c) => n + c.sources.length, 0);
            return (
              <TabsTrigger key={scope.scope} value={scope.scope}>
                {t(`scopes.${scope.scope}`)}
                {sources > 0 ? (
                  <Badge variant="secondary" className="ml-2 tabular-nums">
                    {sources}
                  </Badge>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>

      {scopes.map((scope) => {
        const hasAnySource = scope.categories.some((c) => c.sources.length > 0);
        // Categories holding data come first; the untouched rest of the taxonomy follows in
        // its original order instead of burying the real content between empty headers.
        const ordered = [...scope.categories].sort(
          (a, b) => Number(b.sources.length > 0) - Number(a.sources.length > 0),
        );

        // One format hint per panel, and every field in the panel points at it. It lives inside
        // the TabsContent on purpose: Radix unmounts the inactive panels, so a single hint above
        // the Tabs would leave two thirds of the aria-describedby idrefs dangling.
        const hintId = domId("hint", scope.scope);
        const gridWarningShown = scope.scope === "SCOPE_2" && Boolean(missingGridFactorYear);

        return (
          <TabsContent key={scope.scope} value={scope.scope} className="space-y-4">
            {scope.scope === "SCOPE_2" && missingGridFactorYear ? (
              // Recording kWh is valid regardless. Silently computing zero emissions is the
              // exact class of bug this tool exists to replace.
              //
              // role="status", not role="alert": the warning is informational and does not
              // block the user. An alert would interrupt a screen reader mid-sentence on
              // every tab switch.
              <div
                role="status"
                className="flex items-start gap-3 rounded-lg border border-chart-2/40 bg-chart-2/5 p-4"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-chart-2" aria-hidden />
                <p className="text-sm text-muted-foreground">
                  {/* String, not number: ICU would format 2020 as "2.020". */}
                  {t("gridFactor.missing", { year: String(missingGridFactorYear) })}
                </p>
              </div>
            ) : null}

            {/* The format rule, stated once for the panel, and the Meta as a single row. Both
                are chrome: they sit above the data without competing with it. */}
            <ScopeToolbar
              scope={scope.scope}
              hintId={hintId}
              target={targets[scope.scope] ?? ""}
            />

            {!hasAnySource ? (
              <p className="text-sm text-muted-foreground">{t("empty.noSourcesInScope")}</p>
            ) : null}

            {scope.categories.length === 0 ? (
              <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
                {t("emptyScope")}
              </p>
            ) : (
              ordered.map((category) => (
                <CategorySection
                  key={category.category}
                  category={category}
                  factorCategory={findCategory(grouped, scope.scope, category.category)}
                  gridFactor={gridFactor}
                  gwpSet={gwpSet}
                  year={year}
                  hintId={hintId}
                  gridWarningShown={gridWarningShown}
                />
              ))
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
