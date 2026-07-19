import { requireAdmin } from "@/lib/auth/server";
import { TraceabilityScreen } from "@/features/admin";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  return <TraceabilityScreen searchParams={await searchParams} />;
}
