import { requireAdmin } from "@/lib/auth/server";
import { FactorLibraryScreen } from "@/features/admin";

export default async function Page() {
  await requireAdmin();
  return <FactorLibraryScreen />;
}
