"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/form/select-field";

const ALL = "all";
const SCOPES = ["SCOPE_1", "SCOPE_2", "SCOPE_3"] as const;

// Client filters that write the URL. The server reads the params and does the actual
// filtering, because the library holds about 1700 rows. Any filter change resets the page.
export function FactorFilters({ categories }: { categories: string[] }) {
  const t = useTranslations("admin.factors.filters");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [term, setTerm] = useState(searchParams.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scope = searchParams.get("scope") ?? ALL;
  const category = searchParams.get("category") ?? ALL;
  const status = searchParams.get("status") ?? "active";

  function pushParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "library");
    for (const [key, value] of Object.entries(updates)) {
      if (value === "" || value === ALL) params.delete(key);
      else params.set(key, value);
    }
    params.delete("page"); // any filter change returns to page 1
    startTransition(() =>
      router.replace(`/admin/factors?${params.toString()}`, { scroll: false }),
    );
  }

  function onSearchChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setTerm(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => pushParams({ q: value }), 300);
  }

  function clearAll() {
    if (timer.current) clearTimeout(timer.current);
    setTerm("");
    startTransition(() =>
      router.replace("/admin/factors?tab=library", { scroll: false }),
    );
  }

  const scopeOptions = [
    { value: ALL, label: t("allScopes") },
    ...SCOPES.map((value) => ({ value, label: `${t("scope")} ${value.slice(-1)}` })),
  ];
  const categoryOptions = [
    { value: ALL, label: t("allCategories") },
    ...categories.map((value) => ({ value, label: value })),
  ];
  const statusOptions = [
    { value: "active", label: t("statusActive") },
    { value: "inactive", label: t("statusInactive") },
    { value: ALL, label: t("statusAll") },
  ];

  const hasFilters =
    term !== "" || scope !== ALL || category !== ALL || status !== "active";

  return (
    <div className="space-y-4">
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">
          <Search className="size-4" aria-hidden />
        </span>
        <Input
          id="factor-search"
          className="pl-9"
          placeholder={t("search")}
          aria-label={t("search")}
          value={term}
          onChange={onSearchChange}
        />
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <SelectField
          id="filter-scope"
          label={t("scope")}
          options={scopeOptions}
          value={scope}
          onValueChange={(value) => pushParams({ scope: value })}
          className="w-full sm:w-48"
        />
        <SelectField
          id="filter-category"
          label={t("category")}
          options={categoryOptions}
          value={category}
          onValueChange={(value) => pushParams({ category: value })}
          className="w-full sm:w-56"
        />
        <SelectField
          id="filter-status"
          label={t("status")}
          options={statusOptions}
          value={status}
          onValueChange={(value) => pushParams({ status: value })}
          className="w-full sm:w-44"
        />
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <X className="size-4" aria-hidden />
            {t("clear")}
          </Button>
        ) : null}
        {isPending ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
        ) : null}
      </div>
    </div>
  );
}
