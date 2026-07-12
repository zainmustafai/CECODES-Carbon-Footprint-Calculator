import { Skeleton } from "@/components/ui/skeleton";

// Matches the preview layout: header, the filter bar, a four-up summary row, then two scope
// table cards.
export function PreviewSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <Skeleton className="h-16 rounded-lg" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>

      {Array.from({ length: 2 }).map((_, i) => (
        <Skeleton key={i} className="h-52 rounded-lg" />
      ))}
    </div>
  );
}
