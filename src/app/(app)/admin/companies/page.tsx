import { requireAdmin } from "@/lib/auth/server";
import { CompaniesScreen } from "@/features/admin";

export default async function Page() {
  await requireAdmin();
  return <CompaniesScreen />;
}
