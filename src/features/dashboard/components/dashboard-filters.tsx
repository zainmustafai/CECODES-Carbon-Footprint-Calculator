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

const SCOPE_OPTIONS = ["SCOPE_1", "SCOPE_2", "SCOPE_3"] as const;

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
    if (merged.scope) params.set("scope", merged.scope);
    if (merged.category) params.set("category", merged.category);
    const query = params.toString();
    startTransition(() =>
      router.replace(query ? `${basePath}?${query}` : basePath),
    );
  }

  const hasRefinement = filters.scope !== null || filters.category !== null;

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
    {
      id: "filter-scope",
      label: t("scope"),
      value: filters.scope ?? ALL,
      onChange: (value) =>
        apply({
          scope: value === ALL ? null : (value as Filters["scope"]),
          category: null,
        }),
      options: [
        { value: ALL, label: t("allScopes") },
        ...SCOPE_OPTIONS.map((scope) => ({
          value: scope,
          label: tScopes(scope),
        })),
      ],
      className: "min-w-32",
    },
    {
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
    },
  ];

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

        {hasRefinement && (
          <Button
            size={"sm"}
            onClick={() => apply({ scope: null, category: null })}
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
