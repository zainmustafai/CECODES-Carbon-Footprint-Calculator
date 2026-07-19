"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TraceabilityFilterOptions } from "../lib/load-traceability";

// Filters for the traceability feed: by company, by person, and by date. Every choice lives in
// the URL so the server refetches and a shared link reproduces the exact view, matching the
// preview and dashboard bars. Changing any filter drops the page back to the first.
const ALL = "all";

export function TraceabilityFilters({
  options,
  companyId,
  changedById,
  from,
  to,
}: {
  options: TraceabilityFilterOptions;
  companyId: string | null;
  changedById: string | null;
  from: string | null;
  to: string | null;
}) {
  const t = useTranslations("admin.traceability.filters");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const hasFilters = Boolean(companyId || changedById || from || to);

  function apply(next: Partial<Record<"company" | "person" | "from" | "to", string | null>>) {
    const current = { company: companyId, person: changedById, from, to };
    const merged = { ...current, ...next };
    const params = new URLSearchParams();
    if (merged.company) params.set("company", merged.company);
    if (merged.person) params.set("person", merged.person);
    if (merged.from) params.set("from", merged.from);
    if (merged.to) params.set("to", merged.to);
    // Any filter change invalidates the current page number.
    const query = params.toString();
    startTransition(() => router.replace(query ? `/admin/traceability?${query}` : "/admin/traceability"));
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
      <div className="grid gap-1">
        <Label htmlFor="trace-company" className="text-xs text-muted-foreground">
          {t("company")}
        </Label>
        <Select
          value={companyId ?? ALL}
          onValueChange={(value) => apply({ company: value === ALL ? null : value })}
        >
          <SelectTrigger id="trace-company" size="sm" className="min-w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allCompanies")}</SelectItem>
            {options.companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1">
        <Label htmlFor="trace-person" className="text-xs text-muted-foreground">
          {t("person")}
        </Label>
        <Select
          value={changedById ?? ALL}
          onValueChange={(value) => apply({ person: value === ALL ? null : value })}
        >
          <SelectTrigger id="trace-person" size="sm" className="min-w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allPeople")}</SelectItem>
            {options.people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name?.trim() || p.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1">
        <Label htmlFor="trace-from" className="text-xs text-muted-foreground">
          {t("from")}
        </Label>
        <Input
          id="trace-from"
          type="date"
          value={from ?? ""}
          max={to ?? undefined}
          onChange={(event) => apply({ from: event.target.value || null })}
          className="h-8 w-40"
        />
      </div>

      <div className="grid gap-1">
        <Label htmlFor="trace-to" className="text-xs text-muted-foreground">
          {t("to")}
        </Label>
        <Input
          id="trace-to"
          type="date"
          value={to ?? ""}
          min={from ?? undefined}
          onChange={(event) => apply({ to: event.target.value || null })}
          className="h-8 w-40"
        />
      </div>

      {hasFilters ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => apply({ company: null, person: null, from: null, to: null })}
        >
          <X className="size-4" aria-hidden />
          {t("clear")}
        </Button>
      ) : null}

      {isPending ? (
        <span className="flex items-center gap-1.5 self-center pb-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {t("loading")}
        </span>
      ) : null}
    </div>
  );
}
