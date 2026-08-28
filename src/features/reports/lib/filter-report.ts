import type { Scope } from "@/lib/generated/prisma/client";
import type { ReportVM } from "./types";

// Narrows a ReportVM to a scope/category selection, for the dashboard's "download this view as
// PDF" button (src/features/dashboard/components/download-view-button.tsx). Mirrors
// dashboard-data.ts's own narrowing rule exactly - the filtered PDF and the filtered dashboard can
// never disagree because both apply the same predicate to the same rollup output.
//
// Left UNFILTERED, matching dashboard-data.ts's own choice not to narrow these by scope: bySede
// (a company-wide, all-scope split), removals, cleanTech, and the disclosure counts
// (biogenicTonnes, missingGridFactor, unpricedCount, ...) - a scope filter narrows what's totaled
// per Alcance, not what happened company-wide.
export function filterReportVM(
  vm: ReportVM,
  filters: { scope: Scope[]; category: string | null },
): ReportVM {
  const { scope, category } = filters;
  const matchesScope = (rowScope: Scope) => scope.length === 0 || scope.includes(rowScope);
  const matchesCategory = (rowCategory: string) => !category || rowCategory === category;

  const byCategory = vm.byCategory.filter(
    (c) => matchesScope(c.scope) && matchesCategory(c.category),
  );
  const results = vm.results.filter((r) => matchesScope(r.scope) && matchesCategory(r.category));
  const byScope = vm.byScope.filter((s) => scope.length === 0 || scope.includes(s.scope));
  const totalTonnes = byCategory.reduce((sum, c) => sum + c.tonnes, 0);

  return {
    ...vm,
    byCategory,
    results,
    byScope,
    totalTonnes,
    appliedFilters: { scope, category },
  };
}
