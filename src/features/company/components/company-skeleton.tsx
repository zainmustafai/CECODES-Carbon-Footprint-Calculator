import { Skeleton } from "@/components/ui/skeleton";

// Matches the consolidated company page: header, the profile card (three fields in a row),
// then the Sedes section header plus a card grid. Mirrors the real layout so the page does
// not jump when it arrives.
export function CompanySkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {/* profile card */}
      <div className="space-y-4 rounded-lg border p-6">
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-16 rounded-md" />
          <Skeleton className="h-16 rounded-md" />
          <Skeleton className="h-16 rounded-md" />
        </div>
        <div className="flex justify-end">
          <Skeleton className="h-9 w-28" />
        </div>
      </div>

      {/* Sedes section */}
      <div className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
