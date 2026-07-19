import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma, type Scope } from "@/lib/generated/prisma/client";
import { FACTOR_LIBRARY_TAG, GRID_FACTORS_TAG } from "./factor-cache-tags";

export { FACTOR_LIBRARY_TAG, GRID_FACTORS_TAG };

// WHY THIS IS SAFE TO CACHE (and why the tenant surfaces are not):
//
// The emission-factor library and the SIN grid factors are GLOBAL reference data. Every admin
// sees the identical ~1700 rows; nothing here reads a session, a companyId, or a resolveCompanyScope
// (the whole where clause is built from URL filter params, which are part of the cache key). So one
// cache entry legitimately serves every viewer, and there is no tenant footprint to leak. Company
// dashboards, previews, reports and every resolveCompanyScope read stay dynamic and uncached, on
// purpose: caching one of those would serve one tenant's numbers to another.
//
// cacheComponents (`use cache`) is deliberately NOT enabled app-wide (see next.config.ts: it would
// force the auth-in-layout shell into Suspense on every route). unstable_cache gives the same thing
// this surface needs, a tagged data cache invalidated by the exact mutations, without touching the
// shell. Tags are revalidated in factor-actions.ts on create / update / (de|re)activate / version
// (FACTOR_LIBRARY_TAG) and on the grid upsert / delete (GRID_FACTORS_TAG), so an admin edit is
// reflected on the next render, never stale.
//
// Decimals cannot survive the JSON cache as decimal.js instances, so every factor field crosses as
// a string here, exactly as it already does across the RSC boundary.

const PAGE_SIZE = 50;

export type FactorFilters = {
  q: string;
  scope: Scope | null;
  category: string | null;
  status: "active" | "inactive" | "all";
  page: number;
};

// The display subset the factor table renders. Decimal columns are strings.
export type CachedFactor = {
  id: string;
  scope: Scope;
  category: string;
  subcategory: string | null;
  element: string;
  unit: string;
  active: boolean;
  factorUnit: string | null;
  co2Factor: string | null;
  ch4Factor: string | null;
  n2oFactor: string | null;
  co2eFactor: string | null;
  co2eFactorCop: string | null;
  co2eFactorUsd: string | null;
};

export type FactorLibraryPage = {
  total: number; // rows matching the filter
  totalAll: number; // whole library, for the empty-vs-no-results distinction
  categories: string[];
  factors: CachedFactor[];
  page: number;
  pages: number;
};

export type CachedGridFactor = {
  year: number;
  factor: string;
  source: string | null;
  updatedByEmail: string | null;
  updatedAt: string; // ISO
};

const loadFactorLibraryPage = unstable_cache(
  async (filters: FactorFilters): Promise<FactorLibraryPage> => {
    const where: Prisma.EmissionFactorWhereInput = {};
    if (filters.q) {
      where.OR = [
        { element: { contains: filters.q, mode: "insensitive" } },
        { category: { contains: filters.q, mode: "insensitive" } },
        { subcategory: { contains: filters.q, mode: "insensitive" } },
      ];
    }
    if (filters.scope) where.scope = filters.scope;
    if (filters.category) where.category = filters.category;
    if (filters.status === "active") where.active = true;
    else if (filters.status === "inactive") where.active = false;

    const [total, totalAll, categoryRows] = await Promise.all([
      prisma.emissionFactor.count({ where }),
      prisma.emissionFactor.count(),
      prisma.emissionFactor.findMany({
        distinct: ["category"],
        select: { category: true },
        orderBy: { category: "asc" },
      }),
    ]);

    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(Math.max(1, filters.page), pages);

    const rows = await prisma.emissionFactor.findMany({
      where,
      orderBy: [
        { scope: "asc" },
        { category: "asc" },
        { subcategory: "asc" },
        { element: "asc" },
      ],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        scope: true,
        category: true,
        subcategory: true,
        element: true,
        unit: true,
        active: true,
        factorUnit: true,
        co2Factor: true,
        ch4Factor: true,
        n2oFactor: true,
        co2eFactor: true,
        co2eFactorCop: true,
        co2eFactorUsd: true,
      },
    });

    return {
      total,
      totalAll,
      categories: categoryRows.map((row) => row.category),
      factors: rows.map((r) => ({
        id: r.id,
        scope: r.scope,
        category: r.category,
        subcategory: r.subcategory,
        element: r.element,
        unit: r.unit,
        active: r.active,
        factorUnit: r.factorUnit,
        co2Factor: r.co2Factor?.toString() ?? null,
        ch4Factor: r.ch4Factor?.toString() ?? null,
        n2oFactor: r.n2oFactor?.toString() ?? null,
        co2eFactor: r.co2eFactor?.toString() ?? null,
        co2eFactorCop: r.co2eFactorCop?.toString() ?? null,
        co2eFactorUsd: r.co2eFactorUsd?.toString() ?? null,
      })),
      page,
      pages,
    };
  },
  ["factor-library-page"],
  { tags: [FACTOR_LIBRARY_TAG] },
);

export function getFactorLibraryPage(filters: FactorFilters): Promise<FactorLibraryPage> {
  return loadFactorLibraryPage(filters);
}

export const getGridFactors = unstable_cache(
  async (): Promise<CachedGridFactor[]> => {
    const rows = await prisma.gridElectricityFactor.findMany({ orderBy: { year: "desc" } });
    return rows.map((row) => ({
      year: row.year,
      factor: row.factor.toString(),
      source: row.source,
      updatedByEmail: row.updatedByEmail,
      updatedAt: row.updatedAt.toISOString(),
    }));
  },
  ["grid-factors"],
  { tags: [GRID_FACTORS_TAG] },
);
