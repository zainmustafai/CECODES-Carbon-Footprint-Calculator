import { Skeleton } from "@/components/ui/skeleton";

// Matches the real data-entry layout: page header, the sticky context bar (two selects plus
// the save pill), the scope tabs, and collapsible category blocks.
//
// The generic ScreenSkeleton renders a KPI card grid, which this screen does not have. Using
// it here made the page visibly jump when the real content arrived.
export function DataEntrySkeleton() {
  return (
    <div className="space-y-6">
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

      {/* collapsible category sections */}
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
