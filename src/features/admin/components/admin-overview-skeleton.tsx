import { Skeleton } from "@/components/ui/skeleton";

// Route-level loading UI for /admin. The overview is KPI cards plus two card rows, not a
// table, so it gets its own skeleton; AdminTableSkeleton stays for the table routes.
export function AdminOverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="space-y-3 rounded-lg border p-6">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 rounded-lg border p-6 lg:col-span-1">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-56 w-full rounded-lg" />
        </div>
        <div className="space-y-4 rounded-lg border p-6 lg:col-span-2">
          <Skeleton className="h-5 w-48" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 rounded-lg border p-6 lg:col-span-1">
          <Skeleton className="h-5 w-40" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-5 w-full" />
            ))}
          </div>
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="space-y-4 rounded-lg border p-6 lg:col-span-2">
          <Skeleton className="h-5 w-48" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
