import { requireAdmin } from "@/lib/auth/server";
import { FactorFormScreen } from "@/features/admin/components/factor-form-screen";

export default async function Page() {
  await requireAdmin();
  return <FactorFormScreen />;
}
