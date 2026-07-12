import { Skeleton } from "@/components/ui/skeleton";

// Matches the real data-entry layout: page header, the sticky context bar (two selects plus the
// save pill), the scope tabs, the scope toolbar (the format hint and the Meta row), and then the
// categories: a card for the one carrying data, single lines for the rest of the taxonomy.
//
// This file is a layout contract, not decoration. The generic ScreenSkeleton renders a KPI card
// grid, which this screen does not have, and using it here made the page visibly jump when the
// real content arrived. Keep the resting shapes below in step with the real screen.
export function DataEntrySkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {/* context bar: Sede select, Ano select, save status */}
      <div className="flex flex-col gap-3 border-b pb-3 md:flex-row md:items-end">
        <div className="grid gap-1.5">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-9 w-full md:w-56" />
        </div>
        <div className="grid gap-1.5">
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-9 w-full md:w-36" />
        </div>
        <div className="flex items-center gap-3 md:ml-auto">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>

      {/* scope tabs */}
      <div className="flex gap-2">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-28" />
      </div>

      <div className="space-y-4">
        {/* scope toolbar: the format hint on the left, the Meta row on the right */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Skeleton className="h-4 w-72 max-w-full" />
          <div className="flex items-end gap-2">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>

        {/* the category carrying data is a card; the empty rest of the taxonomy are one-liners */}
        <Skeleton className="h-28 rounded-lg" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
