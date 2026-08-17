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
import { formatGwpSource } from "@/lib/gwp";
import { ExportButtons } from "@/features/reports";
import { loadCompanyWidePreview, loadPreview } from "../lib/load-preview";
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

// The URL sentinel for "todas las sedes" (a company-wide summary). Mirrors reports-screen.tsx's
// own ALL_FACILITIES_PARAM: each screen owns its copy since PreviewFilters treats it as an opaque
// string and does not need to know what it means.
const ALL_FACILITIES_PARAM = "all";

export async function PreviewScreen({
  companyId,
  basePath,
  searchParams,
}: PreviewScreenProps) {
  const t = await getTranslations("preview");
  const tScopes = await getTranslations("dashboard.scopeNames");
  const tSub = await getTranslations("dashboard.scopeSubtitles");
  const format = await getFormatter();

  const isAllFacilities = searchParams.facilityId === ALL_FACILITIES_PARAM;
  const requestedYear = Number(searchParams.year);
  const year = Number.isFinite(requestedYear) ? requestedYear : null;

  const vm = isAllFacilities
    ? await loadCompanyWidePreview(companyId, { year })
    : await loadPreview(companyId, { facilityId: searchParams.facilityId ?? null, year });

  const companyHref = basePath.replace(/\/preview$/, "/company");
  const dataEntryHref = basePath.replace(/\/preview$/, "/data-entry");

  // The export is offered only when there is a facility (or "todas las sedes") and a year to
  // export. Downloading an empty workbook would be a worse answer than not offering the button.
  const canExport = (isAllFacilities || vm.filters.facilityId !== null) && vm.filters.year !== null && !vm.isEmpty;

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">
          {isAllFacilities && vm.filters.year
            ? t("subtitleContextAll", { year: String(vm.filters.year) })
            : vm.selectedFacilityName && vm.filters.year
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
          facilityId={isAllFacilities ? null : vm.filters.facilityId!}
          year={vm.filters.year!}
        />
      ) : null}
    </div>
  );

  // No facilities at all: the company has nothing to preview yet. Company-wide mode never
  // reaches this state (a company with no facilities also has no reporting years, so it falls
  // into "noYear" below instead).
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
      facilityId={isAllFacilities ? ALL_FACILITIES_PARAM : vm.filters.facilityId}
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
              <Link
                href={
                  isAllFacilities
                    ? dataEntryHref
                    : `${dataEntryHref}?facilityId=${vm.filters.facilityId}`
                }
              >
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
                href={
                  isAllFacilities
                    ? dataEntryHref
                    : `${dataEntryHref}?facilityId=${vm.filters.facilityId}&year=${vm.filters.year}`
                }
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
                {t("gwp", { set: formatGwpSource(vm.gwpSet) })}
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

      {/* Company-wide only: how the consolidated total breaks down, sede by sede. Single-facility
          mode never populates bySede, so this stays hidden there. */}
      {vm.bySede.length > 0 ? (
        <Card>
          <CardHeader className="space-y-0.5">
            <CardTitle className="text-base">{t("bySede.title")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("bySede.subtitle")}</p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">{t("filters.facility")}</th>
                    <th className="py-2 text-right font-medium">{t("tCO2e")}</th>
                  </tr>
                </thead>
                <tbody>
                  {vm.bySede.map((sede) => (
                    <tr key={sede.facilityId} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        {sede.facilityName}
                        {sede.incomplete ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {t("bySede.incomplete")}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {format.number(sede.tonnes, { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {vm.missingGridFactor ? (
        <Note tone="warning" icon={<AlertTriangle className="size-4 text-chart-2" aria-hidden />}>
          {t("missingGridNote", { year: String(vm.filters.year) })}
        </Note>
      ) : null}

      {vm.missingTransportSubsidyPrice ? (
        <Note tone="warning" icon={<AlertTriangle className="size-4 text-chart-2" aria-hidden />}>
          {t("missingSubsidyPriceNote", { year: String(vm.filters.year) })}
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

      {/* Removals: their own table with their own (negative) total, never inside the scope
          totals above. Mirrors the Excel's separate BASE_remociones table. */}
      {vm.removals ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <div className="space-y-0.5">
              <CardTitle className="text-base">{t("removals.title")}</CardTitle>
              <p className="text-sm text-muted-foreground">{t("removals.subtitle")}</p>
            </div>
            <Badge variant="secondary" className="tabular-nums">
              {format.number(vm.removals.tonnes, { maximumFractionDigits: 2 })} {t("tCO2e")}
            </Badge>
          </CardHeader>
          <CardContent>
            <PreviewAnnualTable
              group={{ scope: "SCOPE_1", categories: [vm.removals], tonnes: vm.removals.tonnes }}
            />
          </CardContent>
        </Card>
      ) : null}

      {/* Free-form "tecnologías más limpias" reporting: verbatim rows, no totals, never part of
          any calculation (CECODES 2026-07-24). */}
      {vm.cleanTech.length > 0 ? (
        <Card>
          <CardHeader className="space-y-0.5">
            <CardTitle className="text-base">{t("cleanTech.title")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("cleanTech.subtitle")}</p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">{t("cleanTech.scope")}</th>
                    <th className="py-2 pr-4 font-medium">{t("cleanTech.element")}</th>
                    <th className="py-2 pr-4 text-right font-medium">{t("cleanTech.quantity")}</th>
                    <th className="py-2 font-medium">{t("cleanTech.unit")}</th>
                  </tr>
                </thead>
                <tbody>
                  {vm.cleanTech.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {row.scope ? tScopes(row.scope) : "-"}
                      </td>
                      <td className="py-2 pr-4">{row.element}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {row.quantity ?? "-"}
                      </td>
                      <td className="py-2">{row.unit ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{t("cleanTech.footnote")}</p>
          </CardContent>
        </Card>
      ) : null}

      {vm.biogenicTonnes > 0 ? (
        <Note tone="muted" icon={<Leaf className="size-4 text-chart-1" aria-hidden />}>
          {t("biogenicNote", {
            tonnes: format.number(vm.biogenicTonnes, { maximumFractionDigits: 2 }),
          })}
        </Note>
      ) : null}

      {/* Who entered or changed each number, for this sede-year. Per-sede only: "todas las
          sedes" has no single reporting year to show a change log for. */}
      {!isAllFacilities ? (
        <EntryChangeLog
          companyId={companyId}
          facilityId={vm.filters.facilityId}
          year={vm.filters.year}
        />
      ) : null}

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
