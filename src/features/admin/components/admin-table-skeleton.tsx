import { Skeleton } from "@/components/ui/skeleton";

// Route-level loading UI for the admin tables and forms: a header bar plus a block of table
// rows, so the layout does not jump when the real screen arrives.
export function AdminTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="rounded-lg border">
        <div className="border-b p-3">
          <Skeleton className="h-5 w-full max-w-md" />
        </div>
        <div className="divide-y">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="flex items-center gap-4 p-3">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
