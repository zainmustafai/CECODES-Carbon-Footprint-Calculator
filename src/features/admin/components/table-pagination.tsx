import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TablePaginationProps = {
  page: number;
  pages: number;
  total: number;
  // Every current search param except `page`, so the links preserve the active filters.
  baseParams: Record<string, string>;
};

// Server-rendered pagination: plain Links that keep the whole filter state. Page numbers are
// small, so they are safe to pass as numbers; the counts are the only figures that could
// group.
export async function TablePagination({
  page,
  pages,
  total,
  baseParams,
}: TablePaginationProps) {
  const t = await getTranslations("admin.factors.pagination");

  const hrefFor = (target: number) => {
    const params = new URLSearchParams(baseParams);
    params.set("page", String(target));
    return `/admin/factors?${params.toString()}`;
  };

  const canPrev = page > 1;
  const canNext = page < pages;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground tabular-nums">
        {t("total", { count: total })}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground tabular-nums">
          {t("page", { page, pages })}
        </span>
        <Button
          asChild
          variant="outline"
          size="sm"
          aria-disabled={!canPrev}
          className={cn(!canPrev && "pointer-events-none opacity-50")}
        >
          <Link href={hrefFor(page - 1)} scroll={false}>
            <ChevronLeft className="size-4" aria-hidden />
            {t("previous")}
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          size="sm"
          aria-disabled={!canNext}
          className={cn(!canNext && "pointer-events-none opacity-50")}
        >
          <Link href={hrefFor(page + 1)} scroll={false}>
            {t("next")}
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  );
}
