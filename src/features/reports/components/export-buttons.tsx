"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FileDown, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToastAction } from "@/hooks/use-toast-action";

// Report downloads for the current facility and year.
//
// This targets the /api/reports/export route, not a Server Action, because a Server Action
// cannot stream a file back. The route authorizes itself (resolveCompanyScope is its first
// call), so putting the companyId in the query string gives nothing away: a company user's own
// id wins on the server no matter what they send; only an admin's id is honoured, and only for
// a company that exists.
//
// The download is an imperative action, so it follows the toast half of the async policy
// (use-toast-action): a loading toast that becomes success or error, and the clicked button
// spins while every button stays disabled so a slow PDF or XLSX cannot be fired twice. A plain
// `<a download>` gave none of that, generating no signal on a slow build and swallowing failures.
type Format = "pdf" | "xlsx" | "csv";

const KNOWN_ERRORS = new Set(["badRequest", "notFound", "forbidden", "generic"]);

export function ExportButtons({
  companyId,
  facilityId,
  year,
}: {
  /** Only needed for the admin drill-down; a company user's session decides on the server. */
  companyId?: string;
  facilityId: string;
  year: number;
}) {
  const t = useTranslations("reports");
  const { isPending, run } = useToastAction();
  const [active, setActive] = useState<Format | null>(null);

  function href(format: Format): string {
    const query = new URLSearchParams({ facilityId, year: String(year), format });
    if (companyId) query.set("companyId", companyId);
    return `/api/reports/export?${query.toString()}`;
  }

  function exportReport(format: Format) {
    setActive(format);
    void run(() => downloadReport(href(format)), {
      loading: t("generating"),
      success: t("downloaded"),
      // The route returns opaque error keys; map the known ones and fall back to generic.
      errorMessage: (key) => t(`errors.${KNOWN_ERRORS.has(key) ? key : "generic"}`),
      // A download changes nothing on the server, so there is nothing to re-fetch.
      refresh: false,
    }).finally(() => setActive(null));
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        loading={active === "pdf"}
        disabled={isPending}
        onClick={() => exportReport("pdf")}
      >
        <FileDown className="size-4" aria-hidden />
        {t("exportPdf")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        loading={active === "xlsx"}
        disabled={isPending}
        onClick={() => exportReport("xlsx")}
      >
        <FileSpreadsheet className="size-4" aria-hidden />
        {t("exportExcel")}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        loading={active === "csv"}
        disabled={isPending}
        onClick={() => exportReport("csv")}
      >
        <FileText className="size-4" aria-hidden />
        {t("exportCsv")}
      </Button>
    </div>
  );
}

// Fetch the file, then trigger a save from the in-memory blob. Fetching (rather than a bare
// anchor navigation) is what gives us a completion and failure signal to drive the toast.
async function downloadReport(url: string): Promise<{ error?: string }> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    return { error: "generic" }; // network or transport failure
  }

  if (!response.ok) {
    let key = "generic";
    try {
      const body = (await response.json()) as { error?: string };
      if (typeof body.error === "string") key = body.error;
    } catch {
      // Non-JSON error body; keep the generic key.
    }
    return { error: key };
  }

  const blob = await response.blob();
  const filename = filenameFromDisposition(response.headers.get("content-disposition"));
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename ?? "reporte";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke after the click has been handed to the browser, so the download is not cut off.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  return {};
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="?([^"]+?)"?(?:;|$)/i.exec(header);
  return match ? match[1] : null;
}
