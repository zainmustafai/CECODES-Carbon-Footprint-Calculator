import { requireAdmin } from "@/lib/auth/server";
import { FactorLibraryScreen } from "@/features/admin";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  return <FactorLibraryScreen searchParams={sp} />;
}
