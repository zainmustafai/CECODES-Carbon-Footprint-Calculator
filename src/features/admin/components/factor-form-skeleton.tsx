import { Skeleton } from "@/components/ui/skeleton";

// The factor form is three Cards of fields, not a table. Loading it behind the table skeleton
// made the page jump on arrival, which is the whole reason route skeletons exist.
export function FactorFormSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      {Array.from({ length: cards }).map((_, card) => (
        <div key={card} className="space-y-4 rounded-lg border p-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, field) => (
              <div key={field} className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex justify-end gap-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
      </div>
    </div>
  );
}
