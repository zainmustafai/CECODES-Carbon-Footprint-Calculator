import { Skeleton } from "@/components/ui/skeleton";

// Route-level loading UI for /onboarding. Without it the route fell back to the root
// spinner, which renders outside the app shell and made the sidebar flash away and back.
export function OnboardingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  );
}
