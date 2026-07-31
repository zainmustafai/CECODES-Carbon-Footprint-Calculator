import { Skeleton } from "@/components/ui/skeleton";

// Matches the reports layout: header, the filter bar, one export card.
export function ReportsSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <Skeleton className="h-16 rounded-lg" />

      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}
