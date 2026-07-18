import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { AlertTriangle, CalendarRange, Leaf, MapPin, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Scope } from "@/lib/generated/prisma/client";
import { ExportButtons } from "@/features/reports";
import { loadPreview } from "../lib/load-preview";
import { EntryChangeLog } from "./entry-change-log";
import { PreviewFilters } from "./preview-filters";
import { PreviewAnnualTable } from "./preview-annual-table";
import { PreviewMonthlyTable } from "./preview-monthly-table";

type PreviewScreenProps = {
  companyId: string;
  /** "/preview" for a company user, "/admin/companies/[id]/preview" for an admin. */
  basePath: string;
  searchParams: { facilityId?: string; year?: string };
};

const SCOPES: Scope[] = ["SCOPE_1", "SCOPE_2", "SCOPE_3"];

export async function PreviewScreen({
  companyId,
  basePath,
  searchParams,
}: PreviewScreenProps) {
  const t = await getTranslations("preview");
  const tScopes = await getTranslations("dashboard.scopeNames");
  const tSub = await getTranslations("dashboard.scopeSubtitles");
  const format = await getFormatter();

  const requestedYear = Number(searchParams.year);
  const vm = await loadPreview(companyId, {
    facilityId: searchParams.facilityId ?? null,
    year: Number.isFinite(requestedYear) ? requestedYear : null,
  });

  const companyHref = basePath.replace(/\/preview$/, "/company");
  const dataEntryHref = basePath.replace(/\/preview$/, "/data-entry");

  // The export is offered only when there is a facility and a year to export. Downloading an
  // empty workbook would be a worse answer than not offering the button.
  const canExport = vm.filters.facilityId !== null && vm.filters.year !== null && !vm.isEmpty;

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-4">
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
      {canExport ? (
        <ExportButtons
          companyId={companyId}
          facilityId={vm.filters.facilityId!}
          year={vm.filters.year!}
        />
      ) : null}
    </div>
  );

  // No facilities at all: the company has nothing to preview yet.
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
          icon={<Table2 className="size-6" />}
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

  const scopeTonnes = (scope: Scope) =>
    vm.scopes.find((s) => s.scope === scope)?.tonnes ?? 0;

  return (
    <div className="space-y-8">
      {header}
      {filters}

      {/* Headline: grand total plus the three scope subtotals. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-primary/5">
          <CardContent className="space-y-1 pt-6">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t("totalLabel")}
            </p>
            <p className="text-2xl font-semibold tabular-nums">
              {format.number(vm.totalTonnes, { maximumFractionDigits: 2 })}{" "}
              <span className="text-sm font-normal text-muted-foreground">{t("tCO2e")}</span>
            </p>
            {vm.gwpSet ? (
              <p className="text-xs text-muted-foreground">
                {t("gwp", { set: vm.gwpSet })}
              </p>
            ) : null}
          </CardContent>
        </Card>
        {SCOPES.map((scope) => (
          <Card key={scope}>
            <CardContent className="space-y-1 pt-6">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {tScopes(scope)}
              </p>
              <p className="text-2xl font-semibold tabular-nums">
                {format.number(scopeTonnes(scope), { maximumFractionDigits: 2 })}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  {t("tCO2e")}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">{tSub(scope)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {vm.missingGridFactor ? (
        <Note tone="warning" icon={<AlertTriangle className="size-4 text-chart-2" aria-hidden />}>
          {t("missingGridNote", { year: String(vm.filters.year) })}
        </Note>
      ) : null}

      {/* One card per scope that actually has sources. */}
      {vm.scopes
        .filter((scope) => scope.categories.length > 0)
        .map((scope) => (
          <Card key={scope.scope}>
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
              <div className="space-y-0.5">
                <CardTitle className="text-base">{tScopes(scope.scope)}</CardTitle>
                <p className="text-sm text-muted-foreground">{tSub(scope.scope)}</p>
              </div>
              <Badge variant="secondary" className="tabular-nums">
                {format.number(scope.tonnes, { maximumFractionDigits: 2 })} {t("tCO2e")}
              </Badge>
            </CardHeader>
            <CardContent>
              {scope.scope === "SCOPE_2" ? (
                <PreviewMonthlyTable group={scope} />
              ) : (
                <PreviewAnnualTable group={scope} />
              )}
            </CardContent>
          </Card>
        ))}

      {vm.biogenicTonnes > 0 ? (
        <Note tone="muted" icon={<Leaf className="size-4 text-chart-1" aria-hidden />}>
          {t("biogenicNote", {
            tonnes: format.number(vm.biogenicTonnes, { maximumFractionDigits: 2 }),
          })}
        </Note>
      ) : null}

      {/* Who entered or changed each number, for this sede-year. */}
      <EntryChangeLog
        companyId={companyId}
        facilityId={vm.filters.facilityId}
        year={vm.filters.year}
      />

      <p className="text-xs text-muted-foreground">{t("footnote")}</p>
    </div>
  );
}

function Note({
  tone,
  icon,
  children,
}: {
  tone: "warning" | "muted";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={
        tone === "warning"
          ? "flex items-start gap-3 rounded-lg border border-chart-2/40 bg-chart-2/5 p-3"
          : "flex items-start gap-3 rounded-lg border bg-muted/30 p-3"
      }
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
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
