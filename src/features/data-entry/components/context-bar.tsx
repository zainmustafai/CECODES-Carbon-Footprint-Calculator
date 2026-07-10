"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Building2, CalendarRange } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FacilityVM, YearVM } from "../lib/types";
import { CreateYearDialog } from "./create-year-dialog";
import { SaveStatus } from "./save-status";

type ContextBarProps = {
  basePath: string;
  facilities: FacilityVM[];
  years: YearVM[];
  selectedFacilityId: string | null;
  selectedYear: number | null;
  /** Suppressed when the empty state below already offers the same action. */
  showCreateYear?: boolean;
};

// Facility and year live in the URL, so a server render is the single source of truth for
// which reporting year is open, and the selection survives a reload or a shared link.
export function ContextBar({
  basePath,
  facilities,
  years,
  selectedFacilityId,
  selectedYear,
  showCreateYear = true,
}: ContextBarProps) {
  const t = useTranslations("dataEntry.contextBar");
  const router = useRouter();

  const go = (facilityId: string, year?: number) => {
    const params = new URLSearchParams({ facilityId });
    if (year) params.set("year", String(year));
    router.push(`${basePath}?${params.toString()}`);
  };

  return (
    <div className="sticky top-0 z-20 -mx-6 mb-6 border-b bg-background/95 px-6 py-3 backdrop-blur lg:-mx-8 lg:px-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 md:flex md:flex-none md:items-center">
          <label className="grid gap-1 sm:gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t("facility")}</span>
            <Select
              value={selectedFacilityId ?? undefined}
              onValueChange={(facilityId) => go(facilityId)}
              disabled={facilities.length === 0}
            >
              <SelectTrigger className="w-full md:w-56">
                <Building2 className="size-4 text-muted-foreground" aria-hidden />
                <SelectValue placeholder={t("noFacility")} />
              </SelectTrigger>
              <SelectContent>
                {facilities.map((facility) => (
                  <SelectItem key={facility.id} value={facility.id}>
                    {facility.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-1 sm:gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t("year")}</span>
            <Select
              value={selectedYear ? String(selectedYear) : undefined}
              onValueChange={(year) =>
                selectedFacilityId && go(selectedFacilityId, Number(year))
              }
              disabled={years.length === 0}
            >
              <SelectTrigger className="w-full md:w-36">
                <CalendarRange className="size-4 text-muted-foreground" aria-hidden />
                <SelectValue placeholder={t("noYear")} />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year.id} value={String(year.year)}>
                    {year.year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>

        <div className="flex items-center gap-3 md:ml-auto">
          {showCreateYear && selectedFacilityId ? (
            <CreateYearDialog facilityId={selectedFacilityId} basePath={basePath} />
          ) : null}
          <SaveStatus />
        </div>
      </div>
    </div>
  );
}
