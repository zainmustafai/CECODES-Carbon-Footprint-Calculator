import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { Prisma, type Scope } from "@/lib/generated/prisma/client";
import { cn } from "@/lib/utils";
import { FactorFilters } from "./factor-filters";
import { FactorTable } from "./factor-table";
import { TablePagination } from "./table-pagination";
import { GridFactorDialog } from "./grid-factor-dialog";
import { GridFactorsTable } from "./grid-factors-table";
import { VersionsTable } from "./versions-table";

const PAGE_SIZE = 50;

type SearchParams = Record<string, string | string[] | undefined>;
type Tab = "library" | "grid" | "versions";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isScope(value: string): value is Scope {
  return value === "SCOPE_1" || value === "SCOPE_2" || value === "SCOPE_3";
}

// The factor library. A server component throughout: the tab bar and pagination are plain
// Links, and the filters (a client island) only rewrite the URL. Filtering happens here on
// the server because the library holds about 1700 rows.
export async function FactorLibraryScreen({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const t = await getTranslations("admin.factors");
  const tabParam = first(searchParams.tab);
  const tab: Tab =
    tabParam === "grid" || tabParam === "versions" ? tabParam : "library";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/admin/factors/new">
            <Plus className="size-4" aria-hidden />
            {t("create")}
          </Link>
        </Button>
      </div>

      <TabBar tab={tab} />

      {tab === "library" ? <LibraryTab searchParams={searchParams} /> : null}
      {tab === "grid" ? <GridTab /> : null}
      {tab === "versions" ? <VersionsTab /> : null}
    </div>
  );
}

async function TabBar({ tab }: { tab: Tab }) {
  const t = await getTranslations("admin.factors.tabs");
  const items: { key: Tab; label: string }[] = [
    { key: "library", label: t("library") },
    { key: "grid", label: t("grid") },
    { key: "versions", label: t("versions") },
  ];

  return (
    <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
      {items.map((item) => {
        const active = item.key === tab;
        return (
          <Link
            key={item.key}
            href={`/admin/factors?tab=${item.key}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

async function LibraryTab({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations("admin.factors");

  const q = (first(searchParams.q) ?? "").trim();
  const scopeParam = first(searchParams.scope);
  const categoryParam = first(searchParams.category);
  const statusParam = first(searchParams.status) ?? "active";
  const requestedPage = Math.max(
    1,
    Number.parseInt(first(searchParams.page) ?? "1", 10) || 1,
  );

  const where: Prisma.EmissionFactorWhereInput = {};
  if (q) {
    where.OR = [
      { element: { contains: q, mode: "insensitive" } },
      { category: { contains: q, mode: "insensitive" } },
      { subcategory: { contains: q, mode: "insensitive" } },
    ];
  }
  if (scopeParam && isScope(scopeParam)) where.scope = scopeParam;
  if (categoryParam && categoryParam !== "all") where.category = categoryParam;
  if (statusParam === "active") where.active = true;
  else if (statusParam === "inactive") where.active = false;

  const [total, totalAll, categoryRows] = await Promise.all([
    prisma.emissionFactor.count({ where }),
    prisma.emissionFactor.count(),
    prisma.emissionFactor.findMany({
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    }),
  ]);
  const categories = categoryRows.map((row) => row.category);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pages);

  const factors = await prisma.emissionFactor.findMany({
    where,
    orderBy: [
      { scope: "asc" },
      { category: "asc" },
      { subcategory: "asc" },
      { element: "asc" },
    ],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const baseParams: Record<string, string> = { tab: "library" };
  if (q) baseParams.q = q;
  if (scopeParam && isScope(scopeParam)) baseParams.scope = scopeParam;
  if (categoryParam && categoryParam !== "all") baseParams.category = categoryParam;
  if (statusParam !== "active") baseParams.status = statusParam;

  return (
    <div className="space-y-6">
      <FactorFilters categories={categories} />
      {totalAll === 0 ? (
        <EmptyState title={t("empty.libraryTitle")} body={t("empty.libraryBody")} />
      ) : total === 0 ? (
        <EmptyState title={t("empty.noResultsTitle")} body={t("empty.noResultsBody")} />
      ) : (
        <>
          <FactorTable factors={factors} />
          <TablePagination page={page} pages={pages} total={total} baseParams={baseParams} />
        </>
      )}
    </div>
  );
}

async function GridTab() {
  const t = await getTranslations("admin.factors.grid");
  const rows = await prisma.gridElectricityFactor.findMany({
    orderBy: { year: "desc" },
  });
  const gridFactors = rows.map((row) => ({
    year: row.year,
    factor: row.factor.toString(),
    source: row.source,
    updatedByEmail: row.updatedByEmail,
    updatedAt: row.updatedAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <GridFactorDialog />
      </div>
      <GridFactorsTable gridFactors={gridFactors} />
    </div>
  );
}

async function VersionsTab() {
  const versions = await prisma.emissionFactorVersion.findMany({
    orderBy: { date: "desc" },
  });
  return <VersionsTable versions={versions} />;
}
