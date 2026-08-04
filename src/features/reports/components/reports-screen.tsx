import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarRange, FileText, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// Deep imports on purpose: going through the preview barrel would cycle (its screen imports
// this feature's barrel for ExportButtons). loadPreview also gives this page the exact same
// filter resolution and empty-state semantics as the Resumen, so "can export" means the same
// thing on both screens.
import { loadPreview } from "@/features/preview/lib/load-preview";
import { PreviewFilters } from "@/features/preview/components/preview-filters";
import { loadCompanyReportFilters } from "../lib/load-report-filters";
import { ExportButtons } from "./export-buttons";

type ReportsScreenProps = {
  companyId: string;
  /** "/reports" for a company user, "/admin/companies/[id]/reports" for an admin. */
  basePath: string;
  searchParams: { facilityId?: string; year?: string };
};

// The URL sentinel for "todas las sedes" (a company-wide report). Reports-owned: it flows
// through PreviewFilters as an opaque string, which does not need to know what it means.
const ALL_FACILITIES_PARAM = "all";

export async function ReportsScreen({ companyId, basePath, searchParams }: ReportsScreenProps) {
  const t = await getTranslations("reports.page");

  const companyHref = basePath.replace(/\/reports$/, "/company");
  const dataEntryHref = basePath.replace(/\/reports$/, "/data-entry");

  const isAllFacilities = searchParams.facilityId === ALL_FACILITIES_PARAM;
  const requestedYear = Number(searchParams.year);
  const year = Number.isFinite(requestedYear) ? requestedYear : null;

  if (isAllFacilities) {
    const vm = await loadCompanyReportFilters(companyId, { year });

    const header = (
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">
          {vm.selectedYear
            ? t("subtitleContextAll", { year: String(vm.selectedYear) })
            : t("subtitle")}
        </p>
      </div>
    );

    const filters = (
      <PreviewFilters
        basePath={basePath}
        facilities={vm.facilities}
        years={vm.years}
        facilityId={ALL_FACILITIES_PARAM}
        year={vm.selectedYear}
        allFacilitiesOption={{ value: ALL_FACILITIES_PARAM, label: t("filters.allSedes") }}
      />
    );

    if (vm.emptyReason === "noYear") {
      return (
        <div className="space-y-8">
          {header}
          {filters}
          <EmptyState
            icon={<CalendarRange className="size-6" />}
            title={t("empty.noYearTitle")}
            body={t("empty.noYearBody")}
            action={
              <Button asChild>
                <Link href={dataEntryHref}>{t("empty.goToDataEntry")}</Link>
              </Button>
            }
          />
        </div>
      );
    }

    if (vm.emptyReason === "noData") {
      return (
        <div className="space-y-8">
          {header}
          {filters}
          <EmptyState
            icon={<FileText className="size-6" />}
            title={t("empty.noDataTitle")}
            body={t("empty.noDataBody")}
            action={
              <Button asChild>
                <Link href={dataEntryHref}>{t("empty.goToDataEntry")}</Link>
              </Button>
            }
          />
        </div>
      );
    }

    return (
      <div className="space-y-8">
        {header}
        {filters}
        <ExportCard companyId={companyId} facilityId={null} year={vm.selectedYear!} t={t} />
      </div>
    );
  }

  const vm = await loadPreview(companyId, {
    facilityId: searchParams.facilityId ?? null,
    year,
  });

  const header = (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground">
        {vm.selectedFacilityName && vm.filters.year
          ? t("subtitleContext", {
              facility: vm.selectedFacilityName,
              year: String(vm.filters.year),
            })
          : t("subtitle")}
      </p>
    </div>
  );

  if (vm.emptyReason === "noFacility") {
    return (
      <div className="space-y-8">
        {header}
        <EmptyState
          icon={<MapPin className="size-6" />}
          title={t("empty.noFacilityTitle")}
          body={t("empty.noFacilityBody")}
          action={
            <Button asChild>
              <Link href={companyHref}>{t("empty.goToCompany")}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const filters = (
    <PreviewFilters
      basePath={basePath}
      facilities={vm.facilities}
      years={vm.years}
      facilityId={vm.filters.facilityId}
      year={vm.filters.year}
      allFacilitiesOption={{ value: ALL_FACILITIES_PARAM, label: t("filters.allSedes") }}
    />
  );

  if (vm.emptyReason === "noYear") {
    return (
      <div className="space-y-8">
        {header}
        {filters}
        <EmptyState
          icon={<CalendarRange className="size-6" />}
          title={t("empty.noYearTitle")}
          body={t("empty.noYearBody")}
          action={
            <Button asChild>
              <Link href={`${dataEntryHref}?facilityId=${vm.filters.facilityId}`}>
                {t("empty.goToDataEntry")}
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (vm.emptyReason === "noData") {
    return (
      <div className="space-y-8">
        {header}
        {filters}
        <EmptyState
          icon={<FileText className="size-6" />}
          title={t("empty.noDataTitle")}
          body={t("empty.noDataBody")}
          action={
            <Button asChild>
              <Link
                href={`${dataEntryHref}?facilityId=${vm.filters.facilityId}&year=${vm.filters.year}`}
              >
                {t("empty.goToDataEntry")}
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {header}
      {filters}
      <ExportCard
        companyId={companyId}
        facilityId={vm.filters.facilityId!}
        year={vm.filters.year!}
        t={t}
      />
    </div>
  );
}

function ExportCard({
  companyId,
  facilityId,
  year,
  t,
}: {
  companyId: string;
  facilityId: string | null;
  year: number;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const formats = [
    { key: "pdf", title: t("formats.pdfTitle"), body: t("formats.pdfBody") },
    { key: "xlsx", title: t("formats.xlsxTitle"), body: t("formats.xlsxBody") },
    { key: "csv", title: t("formats.csvTitle"), body: t("formats.csvBody") },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-wrap flex-row items-center justify-between gap-4 space-y-0">
        <div className="space-y-0.5">
          <CardTitle className="text-base">{t("exportTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {facilityId === null ? t("exportHintAll") : t("exportHint")}
          </p>
        </div>
        <ExportButtons companyId={companyId} facilityId={facilityId} year={year} />
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-3">
          {formats.map((format) => (
            <div key={format.key} className="space-y-1 rounded-lg border p-4">
              <dt className="text-sm font-medium">{format.title}</dt>
              <dd className="text-sm text-muted-foreground">{format.body}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </div>
      <p className="font-medium">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
      <div className="mt-2">{action}</div>
    </div>
  );
}
