import { Skeleton } from "@/components/ui/skeleton";

// Matches the dashboard layout: header, filter bar, KPI row, the two-up charts, the wide
// trend, and the two-up comparison. The generic ScreenSkeleton is a plain KPI grid, which
// jumped when this richer screen mounted.
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-4 w-40" />
      </div>

      <Skeleton className="h-16 w-full rounded-lg" />

      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-lg" />
        <Skeleton className="h-72 rounded-lg" />
      </div>

      <Skeleton className="h-64 rounded-lg" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  );
}
