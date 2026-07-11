"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DashboardFilters as Filters } from "../lib/types";

const ALL = "__all__";

// The dashboard filter bar. Facility and year select the dataset; scope and category refine
// the headline and the category chart. Every choice lives in the URL, so the server recomputes
// and a shared link reproduces exactly what the user saw. A pending spinner keeps it honest
// while the server round-trips.
export function DashboardFilters({
  basePath,
  filters,
  facilities,
  years,
  categories,
}: {
  basePath: string;
  filters: Filters;
  facilities: { id: string; name: string }[];
  years: number[];
  /** Distinct category names available for the current scope refinement. */
  categories: string[];
}) {
  const t = useTranslations("dashboard.filters");
  const tScopes = useTranslations("dashboard.scopeNames");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function apply(next: Partial<Filters>) {
    const merged = { ...filters, ...next };
    const params = new URLSearchParams();
    if (merged.facilityId) params.set("facilityId", merged.facilityId);
    if (merged.year) params.set("year", String(merged.year));
    if (merged.scope) params.set("scope", merged.scope);
    if (merged.category) params.set("category", merged.category);
    const query = params.toString();
    startTransition(() => router.replace(query ? `${basePath}?${query}` : basePath));
  }

  const hasRefinement = filters.scope !== null || filters.category !== null;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
      <span className="flex items-center gap-1.5 self-center text-xs font-medium text-muted-foreground">
        <SlidersHorizontal className="size-3.5" aria-hidden />
        {t("label")}
        {isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
      </span>

      <Field id="filter-facility" label={t("facility")}>
        <Select
          value={filters.facilityId ?? ALL}
          onValueChange={(value) =>
            apply({ facilityId: value === ALL ? null : value })
          }
        >
          <SelectTrigger id="filter-facility" size="sm" className="min-w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allFacilities")}</SelectItem>
            {facilities.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field id="filter-year" label={t("year")}>
        <Select
          value={filters.year ? String(filters.year) : undefined}
          onValueChange={(value) => apply({ year: Number(value) })}
        >
          <SelectTrigger id="filter-year" size="sm" className="min-w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field id="filter-scope" label={t("scope")}>
        <Select
          value={filters.scope ?? ALL}
          onValueChange={(value) =>
            // Changing scope clears a category that may not exist under the new scope.
            apply({ scope: value === ALL ? null : (value as Filters["scope"]), category: null })
          }
        >
          <SelectTrigger id="filter-scope" size="sm" className="min-w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allScopes")}</SelectItem>
            <SelectItem value="SCOPE_1">{tScopes("SCOPE_1")}</SelectItem>
            <SelectItem value="SCOPE_2">{tScopes("SCOPE_2")}</SelectItem>
            <SelectItem value="SCOPE_3">{tScopes("SCOPE_3")}</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field id="filter-category" label={t("category")}>
        <Select
          value={filters.category ?? ALL}
          onValueChange={(value) => apply({ category: value === ALL ? null : value })}
          disabled={categories.length === 0}
        >
          <SelectTrigger id="filter-category" size="sm" className="min-w-44 max-w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allCategories")}</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {hasRefinement ? (
        <Button
          variant="ghost"
          size="sm"
          className="self-center"
          onClick={() => apply({ scope: null, category: null })}
        >
          {t("clear")}
        </Button>
      ) : null}
    </div>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
