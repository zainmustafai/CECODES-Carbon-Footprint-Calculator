import { requireAdmin } from "@/lib/auth/server";
import { AdminOverviewScreen } from "@/features/admin";

export default async function Page() {
  await requireAdmin();
  return <AdminOverviewScreen />;
}
