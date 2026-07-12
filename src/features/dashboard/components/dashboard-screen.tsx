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
import { CategoryBars } from "./category-bars";
import { MonthlyTrend } from "./monthly-trend";
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
  const vm = await loadDashboard(companyId, {
    facilityId: searchParams.facilityId ?? null,
    year: Number.isFinite(requestedYear) ? requestedYear : null,
    scope: SCOPES.includes(searchParams.scope as Scope)
      ? (searchParams.scope as Scope)
      : null,
    category: searchParams.category ?? null,
  });

  const dataEntryHref = basePath.replace(/\/dashboard$/, "/data-entry");

  if (vm.isEmpty || !vm.current) {
    return <EmptyDashboard basePath={basePath} companyName={vm.company.name} />;
  }

  const { current } = vm;
  const facilityName =
    vm.facilities.find((f) => f.id === vm.filters.facilityId)?.name ??
    t("subtitleAllFacilities");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("subtitle", { facility: facilityName, year: String(current.year) })}
          </p>
        </div>
        {current.lastUpdated ? (
          <p className="text-xs text-muted-foreground">
            {t("lastUpdated", {
              date: format.dateTime(new Date(current.lastUpdated), { dateStyle: "medium" }),
            })}
          </p>
        ) : null}
      </div>

      <DashboardFilters
        basePath={basePath}
        filters={vm.filters}
        facilities={vm.facilities}
        years={vm.years}
        categories={current.byCategory.map((c) => c.category)}
      />

      {current.missingGridFactor ? (
        <Note
          tone="warning"
          icon={<AlertTriangle className="size-4 text-chart-2" aria-hidden />}
        >
          {t("missingGridFactor", { year: String(current.year) })}
        </Note>
      ) : null}

      {current.unpricedCount > 0 ? (
        // Sources the engine could not price are EXCLUDED from every total above, so the
        // headline is too low. Disclose it: an unpriced source is an unknown, not a zero.
        <Note
          tone="warning"
          icon={<AlertTriangle className="size-4 text-chart-2" aria-hidden />}
        >
          {t("unpricedNote", { count: current.unpricedCount })}
        </Note>
      ) : null}

      <KpiCards current={current} previous={vm.previous} targets={vm.targets} />

      {/* Scope + category */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ScopeDonut slices={current.byScope} total={current.yearTotal} />
        <CategoryBars slices={current.byCategory} />
      </div>

      <MonthlyTrend points={current.monthly} year={current.year} />

      {/* Year comparison + meta */}
      <div className="grid gap-6 lg:grid-cols-2">
        <YearComparison totals={vm.yearComparison} currentYear={current.year} />
        <MetaVsReal targets={vm.targets} dataEntryHref={dataEntryHref} />
      </div>

      {current.biogenicTonnes > 0 ? (
        <Note tone="muted" icon={<Leaf className="size-4 text-chart-1" aria-hidden />}>
          {t("biogenic", {
            tonnes: format.number(current.biogenicTonnes, { maximumFractionDigits: 1 }),
          })}
        </Note>
      ) : null}
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
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        {companyName ? (
          <p className="text-sm text-muted-foreground">{companyName}</p>
        ) : null}
      </div>
      <Card className="border-dashed">
        <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Gauge className="size-6" aria-hidden />
          </div>
          <p className="font-medium">{t("emptyTitle")}</p>
          <p className="max-w-md text-sm text-muted-foreground">{t("emptyBody")}</p>
          <Button asChild className="mt-2">
            <Link href={dataEntryHref}>{t("emptyCta")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
