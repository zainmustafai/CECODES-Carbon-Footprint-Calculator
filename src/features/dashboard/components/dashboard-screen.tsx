import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { AlertTriangle, Gauge, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Scope } from "@/lib/generated/prisma/client";
import { loadDashboard } from "../lib/dashboard-data";
import { DashboardFilters } from "./dashboard-filters";
import { KpiCards } from "./kpi-cards";
import { ScopeDonut } from "./scope-donut";
import { ScopeDetailBars } from "./scope-detail-bars";
import { CategoryBars } from "./category-bars";
import { GasBars } from "./gas-bars";
import { ParetoChart } from "./pareto-chart";
import { MonthlyTrend } from "./monthly-trend";
import { SedeBars } from "./sede-bars";
import { YearComparison } from "./year-comparison";
import { MetaVsReal } from "./meta-vs-real";

type DashboardScreenProps = {
  companyId?: string | null;
  /** The route this dashboard lives at, so filters and links stay on it. */
  basePath?: string;
  searchParams?: {
    facilityId?: string;
    year?: string;
    scope?: string;
    category?: string;
  };
};

const SCOPES: Scope[] = ["SCOPE_1", "SCOPE_2", "SCOPE_3"];

export async function DashboardScreen({
  companyId,
  basePath = "/dashboard",
  searchParams = {},
}: DashboardScreenProps) {
  const t = await getTranslations("dashboard");
  const format = await getFormatter();

  if (!companyId) return <EmptyDashboard basePath={basePath} />;

  const requestedYear = Number(searchParams.year);
  // Comma-separated list of scopes in the URL, e.g. "SCOPE_1,SCOPE_3". loadDashboard revalidates
  // and dedupes this itself, so an unknown or malformed token here is harmless.
  const requestedScopes = (searchParams.scope ?? "")
    .split(",")
    .filter((s): s is Scope => SCOPES.includes(s as Scope));
  const vm = await loadDashboard(companyId, {
    facilityId: searchParams.facilityId ?? null,
    year: Number.isFinite(requestedYear) ? requestedYear : null,
    scope: requestedScopes,
    category: searchParams.category ?? null,
  });

  const companyProfileHref = basePath.replace(/\/dashboard$/, "/company");

  if (vm.isEmpty || !vm.current) {
    return <EmptyDashboard basePath={basePath} companyName={vm.company.name} />;
  }

  const { current } = vm;
  const facilityName =
    vm.facilities.find((f) => f.id === vm.filters.facilityId)?.name ??
    t("subtitleAllFacilities");

  // See the comment above the scope+category grid below for why 1 or 2 checked scopes swaps in
  // ScopeDetailBars, while 0 (no filter) or all 3 (equivalent to no filter) keep the donut.
  const showScopeDetail =
    vm.filters.scope.length > 0 && vm.filters.scope.length < SCOPES.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div className="space-y-1">
          <h1 className="font-semibold text-2xl tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("subtitle", {
              facility: facilityName,
              year: String(current.year),
            })}
          </p>
        </div>
        {current.lastUpdated ?
          <p className="text-muted-foreground text-xs">
            {t("lastUpdated", {
              date: format.dateTime(new Date(current.lastUpdated), {
                dateStyle: "medium",
              }),
            })}
          </p>
        : null}
      </div>

      <DashboardFilters
        basePath={basePath}
        filters={vm.filters}
        facilities={vm.facilities}
        years={vm.years}
        categories={current.byCategory.map((c) => c.category)}
      />

      {current.missingGridFactor ?
        <Note
          tone="warning"
          icon={<AlertTriangle className="size-4 text-chart-2" aria-hidden />}
        >
          {t("missingGridFactor", { year: String(current.year) })}
        </Note>
      : null}

      {current.unpricedCount > 0 ?
        // Sources the engine could not price are EXCLUDED from every total above, so the
        // headline is too low. Disclose it: an unpriced source is an unknown, not a zero.
        <Note
          tone="warning"
          icon={<AlertTriangle className="size-4 text-chart-2" aria-hidden />}
        >
          {t("unpricedNote", { count: current.unpricedCount })}
        </Note>
      : null}

      <KpiCards
        current={current}
        previous={vm.previous}
        companyTarget={vm.companyTarget}
        companyProfileHref={companyProfileHref}
      />

      {/*
        Scope + category. The donut is the full three-way breakdown, so it only earns its place
        when the user hasn't narrowed the scope filter at all - OR has checked all three, which
        is the same thing stated differently. Anywhere in between (1 or 2 scopes checked), showing
        a ring that includes the very scope(s) just excluded is not a breakdown, it's noise, so
        ScopeDetailBars takes the donut's place instead: a plain total for exactly what's checked,
        plus the SAME current.byCategory/byElement CategoryBars and the Pareto chart already use,
        redrawn as two column charts (the shape the client's own reference workbook uses,
        chart11.xml/chart12.xml). This is the generalization of the original single-scope ask
        ("please check if it's possible to filter selecting 2 scopes, not only one") to N scopes:
        the detail view always matches the checked subset exactly, and only degenerates back to
        the donut at the two extremes where a subset isn't really a filter.
      */}
      <div className="gap-6 grid lg:grid-cols-2">
        {showScopeDetail ? (
          <ScopeDetailBars
            scopes={vm.filters.scope}
            total={current.total}
            byCategory={current.byCategory}
            byElement={current.byElement}
          />
        ) : (
          <ScopeDonut slices={current.byScope} total={current.yearTotal} />
        )}
        <CategoryBars slices={current.byCategory} />
      </div>

      <GasBars breakdown={current.byGas} />

      <ParetoChart byElement={current.byElement} />

      <MonthlyTrend points={current.monthly} year={current.year} />

      {/* Emissions per sede, as in the client's Power BI reference. Only on the all-facilities
          view with at least two sedes reporting this year. */}
      {vm.bySede.length >= 2 ? <SedeBars sedes={vm.bySede} /> : null}

      {/* Year comparison + meta */}
      <div className="gap-6 grid lg:grid-cols-2">
        <YearComparison totals={vm.yearComparison} currentYear={current.year} />
        <MetaVsReal target={vm.companyTarget} companyProfileHref={companyProfileHref} />
      </div>

      {current.removalsTonnes !== 0 ?
        // Removals live outside every total above, exactly as the Excel keeps its removals
        // table separate. The note is the disclosure that they exist and where they are.
        <Note
          tone="muted"
          icon={<Leaf className="size-4 text-chart-1" aria-hidden />}
        >
          {t("removalsNote", {
            tonnes: format.number(current.removalsTonnes, {
              maximumFractionDigits: 2,
            }),
          })}
        </Note>
      : null}

      {current.biogenicTonnes > 0 ?
        <Note
          tone="muted"
          icon={<Leaf className="size-4 text-chart-1" aria-hidden />}
        >
          {t("biogenic", {
            tonnes: format.number(current.biogenicTonnes, {
              maximumFractionDigits: 1,
            }),
          })}
        </Note>
      : null}
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
        tone === "warning" ?
          "flex items-start gap-3 rounded-lg border border-chart-2/40 bg-chart-2/5 p-3"
        : "flex items-start gap-3 rounded-lg border bg-muted/30 p-3"
      }
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <p className="text-muted-foreground text-sm">{children}</p>
    </div>
  );
}

async function EmptyDashboard({
  basePath,
  companyName,
}: {
  basePath: string;
  companyName?: string;
}) {
  const t = await getTranslations("dashboard");
  const dataEntryHref = basePath.replace(/\/dashboard$/, "/data-entry");

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-semibold text-2xl tracking-tight">{t("title")}</h1>
        {companyName ?
          <p className="text-muted-foreground text-sm">{companyName}</p>
        : null}
      </div>
      <Card className="border-dashed">
        <CardContent className="flex flex-col justify-center items-center gap-3 py-12 min-h-64 text-center">
          <div className="flex justify-center items-center bg-primary/10 rounded-full size-12 text-primary">
            <Gauge className="size-6" aria-hidden />
          </div>
          <p className="font-medium">{t("emptyTitle")}</p>
          <p className="max-w-md text-muted-foreground text-sm">
            {t("emptyBody")}
          </p>
          <Button asChild className="mt-2">
            <Link href={dataEntryHref}>{t("emptyCta")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
