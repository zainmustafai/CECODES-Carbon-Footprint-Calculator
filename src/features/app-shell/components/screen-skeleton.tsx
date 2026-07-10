import { Skeleton } from "@/components/ui/skeleton";

// Route-level loading UI. Mirrors the page header plus a responsive block of cards, so the
// layout does not jump when the real screen arrives.
export function ScreenSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: cards }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}
