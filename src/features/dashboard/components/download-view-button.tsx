"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToastAction } from "@/hooks/use-toast-action";
import { downloadReportFile } from "@/features/reports/lib/download-file";
import type { DashboardFilters } from "../lib/types";

const KNOWN_ERRORS = new Set(["badRequest", "notFound", "forbidden", "generic"]);

// "Download this view as PDF" - client feedback 2026-08-28: apply dashboard filters (facility,
// year, scope, category), then download a PDF report that reflects exactly that filtered view.
// Reuses the SAME /api/reports/export route + PDF template the Reports page already uses (see
// filter-report.ts): the query string is built the same way dashboard-filters.tsx already encodes
// its own URL (scope comma-joined), so a "download this view" click and the URL the user is
// already looking at can never disagree about which filter is active.
export function DownloadViewButton({
  companyId,
  filters,
}: {
  /** Only needed for the admin drill-down; a company user's session decides on the server. */
  companyId?: string;
  filters: DashboardFilters;
}) {
  const t = useTranslations("dashboard.downloadView");
  const tReports = useTranslations("reports");
  const { isPending, run } = useToastAction();
  const [active, setActive] = useState(false);

  function href(): string {
    const query = new URLSearchParams({ format: "pdf" });
    if (filters.year) query.set("year", String(filters.year));
    if (filters.facilityId) query.set("facilityId", filters.facilityId);
    if (filters.scope.length > 0) query.set("scope", filters.scope.join(","));
    if (filters.category) query.set("category", filters.category);
    if (companyId) query.set("companyId", companyId);
    return `/api/reports/export?${query.toString()}`;
  }

  function download() {
    setActive(true);
    void run(() => downloadReportFile(href()), {
      loading: tReports("generating"),
      success: tReports("downloaded"),
      errorMessage: (key) => tReports(`errors.${KNOWN_ERRORS.has(key) ? key : "generic"}`),
      refresh: false,
    }).finally(() => setActive(false));
  }

  return (
    <Button
      variant="outline"
      size="sm"
      loading={active}
      disabled={isPending || !filters.year}
      onClick={download}
    >
      <FileDown className="size-4" aria-hidden />
      {t("button")}
    </Button>
  );
}
