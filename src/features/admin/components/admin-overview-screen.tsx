import type { ReactNode } from "react";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowRight, CheckCircle2, Library } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { loadAdminOverview, type AttentionKind } from "../lib/load-admin-overview";
import { loadAdminTraceability } from "../lib/load-traceability";
import { PortfolioDonut } from "./portfolio-donut";
import { TraceabilityFeed } from "./traceability-feed";

// The CECODES admin home. It answers the two questions the platform team actually has: which
// companies need a nudge, and is the data trustworthy. Routes stay thin: the page guards with
// requireAdmin() and renders this; the loaders authorize themselves regardless.
export async function AdminOverviewScreen() {
  const t = await getTranslations("admin.overview");
  const tk = await getTranslations("admin.overview.attention.kinds");
  const format = await getFormatter();
  const n = (value: number) => format.number(value);

  const attentionLabel = (kind: AttentionKind, blankMonths?: number) =>
    kind === "scope2Incomplete"
      ? tk("scope2Incomplete", { count: String(blankMonths ?? 0) })
      : tk(kind);

  const [overview, activity] = await Promise.all([
    loadAdminOverview(),
    loadAdminTraceability({ pageSize: 8 }),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Portfolio KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label={t("kpi.companies")}
          value={n(overview.companies.total)}
          caption={t("kpi.companiesCaption", {
            active: n(overview.companies.active),
            inactive: n(overview.companies.inactive),
          })}
        />
        <Kpi label={t("kpi.users")} value={n(overview.usersTotal)} caption={t("kpi.usersCaption")} />
        <Kpi
          label={t("kpi.reporting", { year: String(overview.currentYear) })}
          value={`${n(overview.currentYearReporting)} / ${n(overview.companies.active)}`}
          caption={t("kpi.reportingCaption", { year: String(overview.currentYear) })}
        />
        <Kpi
          label={t("kpi.factors")}
          value={n(overview.library.factorCount)}
          caption={
            overview.library.version
              ? t("kpi.factorsCaption", { version: overview.library.version.version })
              : t("kpi.factorsNoVersion")
          }
        />
      </div>

      {/* Portfolio status and library health share the narrow column; the follow-up list and the
          activity feed share the wide one.

          These were two independent 1+2 grids before, one per row, and that is what produced the
          dead space: the follow-up list renders up to twelve rows, so it set the height of ITS
          row, and the donut card beside it stretched to match with nothing to put in the gap.
          Stacking the two narrow cards in one column means the tall list is balanced by two cards
          instead of one, and items-start stops whichever column ends first from stretching.

          The cost is the small-screen order, which is now portfolio, library, follow-up, activity
          rather than alternating. The KPI row above still carries the headline numbers, so the
          first screen on mobile is unchanged. */}
      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <div className="space-y-4 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("portfolio.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <PortfolioDonut portfolio={overview.portfolio} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <Library className="size-4 text-muted-foreground" aria-hidden />
              <CardTitle className="text-base">{t("library.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <LibraryRow label={t("library.factors")} value={n(overview.library.factorCount)} />
              <LibraryRow
                label={t("library.version")}
                value={
                  overview.library.version ? (
                    <span className="text-right">
                      <span className="font-mono">{overview.library.version.version}</span>
                      <span className="block text-xs font-normal text-muted-foreground">
                        {format.dateTime(overview.library.version.date, {
                          dateStyle: "medium",
                          timeZone: "America/Bogota",
                        })}
                      </span>
                    </span>
                  ) : (
                    t("library.noVersion")
                  )
                }
              />
              <LibraryRow
                label={t("library.recentChanges")}
                value={t("library.recentChangesValue", {
                  count: String(overview.library.recentChanges),
                })}
              />
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href="/admin/factors">
                  {t("library.open")}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">{t("attention.title")}</CardTitle>
              {overview.attention.length > 0 ? (
                <Badge variant="secondary" className="tabular-nums">
                  {n(overview.attention.length)}
                </Badge>
              ) : null}
            </CardHeader>
            <CardContent>
              {overview.attention.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <CheckCircle2 className="size-8 text-primary" aria-hidden />
                  <p className="text-sm text-muted-foreground">{t("attention.empty")}</p>
                </div>
              ) : (
                <ul className="divide-y">
                  {overview.attention.slice(0, 12).map((item) => (
                    <li
                      key={`${item.companyId}-${item.facilityName}-${item.year}-${item.kind}`}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/admin/companies/${item.companyId}/data-entry`}
                          className="text-sm font-medium hover:underline"
                        >
                          {item.companyName}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {t("attention.sedeYear", {
                            sede: item.facilityName,
                            year: String(item.year),
                          })}
                        </p>
                      </div>
                      <AttentionBadge
                        label={attentionLabel(item.kind, item.blankMonths)}
                        blocking={item.kind !== "scope2Incomplete"}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {overview.attention.length > 12 ? (
                <p className="pt-3 text-xs text-muted-foreground">
                  {t("attention.more", { count: String(overview.attention.length - 12) })}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">{t("activity.title")}</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/traceability">
                  {t("activity.viewAll")}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              <TraceabilityFeed rows={activity.rows} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-mono text-3xl font-semibold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{caption}</p>
      </CardContent>
    </Card>
  );
}

function LibraryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

// A blocking issue (an empty or stalled year, or a missing grid factor) is amber; a merely
// partial Scope 2 is neutral, because consumption is already recorded there.
function AttentionBadge({ label, blocking }: { label: string; blocking: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
        blocking ? "bg-chart-2/10 text-chart-2" : "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}
