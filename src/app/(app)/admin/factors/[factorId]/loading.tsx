import { FactorFormSkeleton } from "@/features/admin/components/factor-form-skeleton";

// The detail page is the form plus the change-history card beneath it.
export default function Loading() {
  return <FactorFormSkeleton cards={4} />;
}
