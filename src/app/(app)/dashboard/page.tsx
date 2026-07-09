import { requireUser } from "@/lib/auth/server";
import { DashboardScreen } from "@/features/dashboard";

export default async function Page() {
  const user = await requireUser();
  return <DashboardScreen email={user.email} />;
}
