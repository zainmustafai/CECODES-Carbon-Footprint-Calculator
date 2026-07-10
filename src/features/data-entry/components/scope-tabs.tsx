"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { findCategory } from "../lib/group-factors";
import type { GroupedFactors, ScopeVM } from "../lib/types";
import { CategorySection } from "./category-section";

type ScopeTabsProps = {
  scopes: ScopeVM[];
  grouped: GroupedFactors;
  /** The reporting year has no national grid factor, so Scope 2 cannot be computed yet. */
  missingGridFactorYear: number | null;
};

export function ScopeTabs({ scopes, grouped, missingGridFactorYear }: ScopeTabsProps) {
  const t = useTranslations("dataEntry");

  return (
    <Tabs defaultValue="SCOPE_1" className="gap-6">
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

      {scopes.map((scope) => (
        <TabsContent key={scope.scope} value={scope.scope} className="space-y-4">
          {scope.scope === "SCOPE_2" && missingGridFactorYear ? (
            // Recording kWh is valid regardless. Silently computing zero emissions is the
            // exact class of bug this tool exists to replace.
            <div className="flex items-start gap-3 rounded-lg border border-chart-2/40 bg-chart-2/5 p-4">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-chart-2" aria-hidden />
              <p className="text-sm text-muted-foreground">
                {/* String, not number: ICU would format 2020 as "2.020". */}
                {t("gridFactor.missing", { year: String(missingGridFactorYear) })}
              </p>
            </div>
          ) : null}

          {scope.categories.length === 0 ? (
            <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
              {t("emptyScope")}
            </p>
          ) : (
            scope.categories.map((category) => (
              <CategorySection
                key={category.category}
                category={category}
                factorCategory={findCategory(grouped, scope.scope, category.category)}
              />
            ))
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
