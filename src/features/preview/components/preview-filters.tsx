"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PreviewFacility } from "../lib/types";

// The facility and year picker for the preview. Both choices live in the URL so the server
// recomputes and a shared link reproduces the exact view, matching the data-entry and
// dashboard bars. A pending spinner keeps the wait honest.
export function PreviewFilters({
  basePath,
  facilities,
  years,
  facilityId,
  year,
}: {
  basePath: string;
  facilities: PreviewFacility[];
  years: number[];
  facilityId: string | null;
  year: number | null;
}) {
  const t = useTranslations("preview.filters");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function apply(next: { facilityId?: string; year?: number }) {
    const mergedFacility = next.facilityId ?? facilityId ?? "";
    // Changing the facility can invalidate the year, so it is dropped and the server picks the
    // most recent one for the new facility.
    const mergedYear = next.facilityId ? undefined : next.year ?? year ?? undefined;
    const params = new URLSearchParams();
    if (mergedFacility) params.set("facilityId", mergedFacility);
    if (mergedYear) params.set("year", String(mergedYear));
    const query = params.toString();
    startTransition(() => router.replace(query ? `${basePath}?${query}` : basePath));
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
      <div className="grid gap-1">
        <Label htmlFor="preview-facility" className="text-xs text-muted-foreground">
          {t("facility")}
        </Label>
        <Select
          value={facilityId ?? undefined}
          onValueChange={(value) => apply({ facilityId: value })}
        >
          <SelectTrigger id="preview-facility" size="sm" className="min-w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {facilities.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1">
        <Label htmlFor="preview-year" className="text-xs text-muted-foreground">
          {t("year")}
        </Label>
        <Select
          value={year ? String(year) : undefined}
          onValueChange={(value) => apply({ year: Number(value) })}
          disabled={years.length === 0}
        >
          <SelectTrigger id="preview-year" size="sm" className="min-w-24">
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
      </div>

      {isPending ? (
        <span className="flex items-center gap-1.5 self-center pb-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {t("loading")}
        </span>
      ) : null}
    </div>
  );
}
