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
  /** The route this dashboard lives at, for filter links. */
  basePath?: string;
  /** Absolute or relative path to the data‑entry page. */
  dataEntryHref: string;
  searchParams?: {
    facilityId?: string;
    year?: string;
    scope?: string;
    category?: string;
  };
};

const SCOPES: readonly Scope[] = ["SCOPE_1", "SCOPE_2", "SCOPE_3"] as const;

// ------------------------------------------------------------------ helpers

/** Safely parse a year string into a positive integer (1900–2100). */
function parseYear(raw?: string): number | null {
  if (!raw) return null;
  const num = Number.parseInt(raw, 10);
  return Number.isNaN(num) || num < 1900 || num > 2100 ? null : num;
}

// ------------------------------------------------------------------ component

export async function DashboardScreen({
  companyId,
  basePath = "/dashboard",
  dataEntryHref,
  searchParams = {},
}: DashboardScreenProps) {
  const t = await getTranslations("dashboard");
  const format = await getFormatter();

  if (!companyId) {
    return <EmptyDashboard dataEntryHref={dataEntryHref} />;
  }

  // Graceful error boundary – show an error card instead of crashing the route.
  let vm;
  try {
    vm = await loadDashboard(companyId, {
      facilityId: searchParams.facilityId ?? null,
      year: parseYear(searchParams.year),
      scope:
        SCOPES.includes(searchParams.scope as Scope) ?
          (searchParams.scope as Scope)
        : null,
      category: searchParams.category ?? null,
    });
  } catch (error) {
    console.error("Dashboard load failed:", error);
    return (
      <DashboardError
        basePath={basePath}
        dataEntryHref={dataEntryHref}
        message={t("loadingError")} // add this key to your translations
      />
    );
  }

  if (vm.isEmpty || !vm.current) {
    return (
      <EmptyDashboard
        dataEntryHref={dataEntryHref}
        companyName={vm.company.name}
      />
    );
  }

  const { current } = vm;
  const facilityName =
    vm.facilities.find((f) => f.id === vm.filters.facilityId)?.name ??
    t("subtitleAllFacilities");

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

      {/* Warnings – role="alert" ensures screen readers announce them immediately */}
      {current.missingGridFactor ?
        <Note
          tone="warning"
          role="alert"
          icon={<AlertTriangle className="size-4 text-chart-2" aria-hidden />}
        >
          {t("missingGridFactor", { year: String(current.year) })}
        </Note>
      : null}

      {current.unpricedCount > 0 ?
        <Note
          tone="warning"
          role="alert"
          icon={<AlertTriangle className="size-4 text-chart-2" aria-hidden />}
        >
          {t("unpricedNote", { count: current.unpricedCount })}
        </Note>
      : null}

      <KpiCards current={current} previous={vm.previous} targets={vm.targets} />

      {/* Scope + category */}
      <div className="gap-6 grid lg:grid-cols-2">
        <ScopeDonut slices={current.byScope} total={current.yearTotal} />
        <CategoryBars slices={current.byCategory} />
      </div>

      <MonthlyTrend points={current.monthly} year={current.year} />

      {/* Year comparison + meta */}
      <div className="gap-6 grid lg:grid-cols-2">
        <YearComparison totals={vm.yearComparison} currentYear={current.year} />
        <MetaVsReal targets={vm.targets} dataEntryHref={dataEntryHref} />
      </div>

      {current.biogenicTonnes > 0 ?
        <Note
          tone="muted"
          role="status"
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

// ------------------------------------------------------------------ internal components

function Note({
  tone,
  role = "status",
  icon,
  children,
}: {
  tone: "warning" | "muted";
  role?: "status" | "alert";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      role={role}
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
  dataEntryHref,
  companyName,
}: {
  dataEntryHref: string;
  companyName?: string;
}) {
  const t = await getTranslations("dashboard");

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

function DashboardError({
  basePath,
  dataEntryHref,
  message,
}: {
  basePath: string;
  dataEntryHref: string;
  message: string;
}) {
  // Reuse the empty state with a contextual message and a retry button
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-semibold text-2xl tracking-tight">
          Dashboard Error
        </h1>
      </div>
      <Card className="bg-destructive/5 border-destructive/40">
        <CardContent className="flex flex-col justify-center items-center gap-3 py-12 min-h-64 text-center">
          <AlertTriangle className="size-8 text-destructive" aria-hidden />
          <p className="font-medium text-destructive">{message}</p>
          <div className="flex gap-3">
            <Button variant="outline" asChild>
              <Link href={basePath}>Refresh</Link>
            </Button>
            <Button asChild>
              <Link href={dataEntryHref}>Go to data entry</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
