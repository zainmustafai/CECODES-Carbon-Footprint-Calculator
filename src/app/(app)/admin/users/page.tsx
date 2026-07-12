import { requireAdmin } from "@/lib/auth/server";
import { UsersScreen } from "@/features/admin";

export default async function Page() {
  await requireAdmin();
  return <UsersScreen />;
}
