"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Scope } from "@/lib/generated/prisma/client";
import type { DashboardFilters as Filters } from "../lib/types";

const ALL = "__all__";

const SCOPE_OPTIONS = ["SCOPE_1", "SCOPE_2", "SCOPE_3"] as const satisfies readonly Scope[];

type FilterField = {
  id: string;
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  className?: string;
};

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
    if (merged.scope.length > 0) params.set("scope", merged.scope.join(","));
    if (merged.category) params.set("category", merged.category);
    const query = params.toString();
    startTransition(() =>
      router.replace(query ? `${basePath}?${query}` : basePath),
    );
  }

  // Toggling a scope always clears the category filter, same as the old single-select scope
  // field did: the category list on offer depends on which scope(s) are active, so a category
  // picked under the old selection may no longer even exist under the new one.
  function toggleScope(scope: Scope) {
    const next = filters.scope.includes(scope)
      ? filters.scope.filter((s) => s !== scope)
      : [...filters.scope, scope];
    apply({ scope: next, category: null });
  }

  const hasRefinement = filters.scope.length > 0 || filters.category !== null;

  const filterFields: FilterField[] = [
    {
      id: "filter-facility",
      label: t("facility"),
      value: filters.facilityId ?? ALL,
      onChange: (value) => apply({ facilityId: value === ALL ? null : value }),
      options: [
        { value: ALL, label: t("allFacilities") },
        ...facilities.map((f) => ({ value: f.id, label: f.name })),
      ],
      className: "min-w-40",
    },
    {
      id: "filter-year",
      label: t("year"),
      value: filters.year ? String(filters.year) : undefined,
      onChange: (value) => apply({ year: Number(value) }),
      options: years.map((y) => ({ value: String(y), label: String(y) })),
      className: "min-w-24",
    },
  ];

  const categoryField: FilterField = {
    id: "filter-category",
    label: t("category"),
    value: filters.category ?? ALL,
    onChange: (value) => apply({ category: value === ALL ? null : value }),
    options: [
      { value: ALL, label: t("allCategories") },
      ...categories.map((c) => ({ value: c, label: c })),
    ],
    disabled: categories.length === 0,
    className: "min-w-44 max-w-60",
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="flex flex-1 items-center self-center gap-1.5 w-full font-medium text-muted-foreground text-xl">
        <SlidersHorizontal aria-hidden />
        {t("label")}
        {isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      </span>
      <div className="flex flex-wrap items-end gap-3 bg-card p-3 border rounded-lg">
        {filterFields.map((field) => (
          <Field key={field.id} id={field.id} label={field.label}>
            <Select
              value={field.value}
              onValueChange={field.onChange}
              disabled={field.disabled}
            >
              <SelectTrigger
                id={field.id}
                size="sm"
                className={field.className}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {field.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ))}

        {/* Three fixed, known options: a checkbox group is simpler and more discoverable here
            than a generic multi-select dropdown, and lets more than one Alcance be checked at
            once (the client's own ask), which a single-value Select cannot express at all. */}
        <Field id="filter-scope" label={t("scope")}>
          <div
            role="group"
            aria-label={t("scope")}
            className="flex h-8 items-center gap-3 px-1"
          >
            {SCOPE_OPTIONS.map((scope) => (
              <label
                key={scope}
                htmlFor={`filter-scope-${scope}`}
                className="flex items-center gap-1.5 text-sm cursor-pointer"
              >
                <Checkbox
                  id={`filter-scope-${scope}`}
                  checked={filters.scope.includes(scope)}
                  onCheckedChange={() => toggleScope(scope)}
                />
                {tScopes(scope)}
              </label>
            ))}
          </div>
        </Field>

        <Field key={categoryField.id} id={categoryField.id} label={categoryField.label}>
          <Select
            value={categoryField.value}
            onValueChange={categoryField.onChange}
            disabled={categoryField.disabled}
          >
            <SelectTrigger
              id={categoryField.id}
              size="sm"
              className={categoryField.className}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categoryField.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {hasRefinement && (
          <Button
            size={"sm"}
            onClick={() => apply({ scope: [], category: null })}
          >
            {t("clear")}
          </Button>
        )}
      </div>
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
    <div className="gap-1 grid">
      <Label htmlFor={id} className="text-muted-foreground text-xs">
        {label}
      </Label>
      {children}
    </div>
  );
}
