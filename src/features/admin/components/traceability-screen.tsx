import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  loadAdminTraceability,
  loadTraceabilityFilterOptions,
} from "../lib/load-traceability";
import { TraceabilityFilters } from "./traceability-filters";
import { TraceabilityFeed } from "./traceability-feed";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// The dedicated cross-company traceability page. Routes stay thin: the page guards with
// requireAdmin() and renders this. The loaders authorize themselves regardless.
export async function TraceabilityScreen({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations("admin.traceability");

  const companyId = first(searchParams.company);
  const changedById = first(searchParams.person);
  const fromStr = first(searchParams.from);
  const toStr = first(searchParams.to);
  const pageStr = first(searchParams.page);
  const requestedPage = pageStr ? Number(pageStr) : 1;

  // Coarse day bounds. The audit is a follow-up tool, not an accounting ledger, so a filter to
  // the server day is precise enough; the times themselves are shown per row.
  const from = fromStr ? new Date(`${fromStr}T00:00:00`) : undefined;
  const to = toStr ? new Date(`${toStr}T23:59:59.999`) : undefined;

  const [data, options] = await Promise.all([
    loadAdminTraceability({
      companyId: companyId ?? undefined,
      changedById: changedById ?? undefined,
      from: Number.isNaN(from?.getTime()) ? undefined : from,
      to: Number.isNaN(to?.getTime()) ? undefined : to,
      page: Number.isFinite(requestedPage) ? requestedPage : 1,
    }),
    loadTraceabilityFilterOptions(),
  ]);

  function pageHref(page: number): string {
    const params = new URLSearchParams();
    if (companyId) params.set("company", companyId);
    if (changedById) params.set("person", changedById);
    if (fromStr) params.set("from", fromStr);
    if (toStr) params.set("to", toStr);
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return query ? `/admin/traceability?${query}` : "/admin/traceability";
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <TraceabilityFilters
        options={options}
        companyId={companyId}
        changedById={changedById}
        from={fromStr}
        to={toStr}
      />

      <Card>
        <CardContent className="pt-6">
          <TraceabilityFeed rows={data.rows} />
        </CardContent>
      </Card>

      {data.pageCount > 1 ? (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground tabular-nums">
            {t("pageOf", { page: String(data.page), total: String(data.pageCount) })}
          </p>
          <div className="flex gap-2">
            {data.page <= 1 ? (
              <Button variant="outline" size="sm" disabled>
                <ChevronLeft className="size-4" aria-hidden />
                {t("previous")}
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href={pageHref(data.page - 1)}>
                  <ChevronLeft className="size-4" aria-hidden />
                  {t("previous")}
                </Link>
              </Button>
            )}
            {data.page >= data.pageCount ? (
              <Button variant="outline" size="sm" disabled>
                {t("next")}
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href={pageHref(data.page + 1)}>
                  {t("next")}
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
