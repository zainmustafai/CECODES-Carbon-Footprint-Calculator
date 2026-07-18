import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FileDown, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

// Download links for the current facility and year.
//
// Plain links, not Server Actions: a Server Action cannot stream a file back. The route
// authorizes itself (resolveCompanyScope is its first call), so putting the companyId in the
// query string gives nothing away. A company user's own id wins on the server no matter what
// they send; only an admin's id is honoured, and only for a company that exists.
export async function ExportButtons({
  companyId,
  facilityId,
  year,
}: {
  /** Only needed for the admin drill-down; a company user's session decides on the server. */
  companyId?: string;
  facilityId: string;
  year: number;
}) {
  const t = await getTranslations("reports");

  const params = (format: "xlsx" | "csv" | "pdf") => {
    const query = new URLSearchParams({
      facilityId,
      year: String(year),
      format,
    });
    if (companyId) query.set("companyId", companyId);
    return `/api/reports/export?${query.toString()}`;
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline" size="sm">
        {/* download so the browser saves it instead of navigating to a binary blob. */}
        <Link href={params("pdf")} download prefetch={false}>
          <FileDown className="size-4" aria-hidden />
          {t("exportPdf")}
        </Link>
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link href={params("xlsx")} download prefetch={false}>
          <FileSpreadsheet className="size-4" aria-hidden />
          {t("exportExcel")}
        </Link>
      </Button>
      <Button asChild variant="ghost" size="sm">
        <Link href={params("csv")} download prefetch={false}>
          <FileText className="size-4" aria-hidden />
          {t("exportCsv")}
        </Link>
      </Button>
    </div>
  );
}
