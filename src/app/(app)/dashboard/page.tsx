import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth/server";
import { DashboardScreen } from "@/features/dashboard";

export default async function Page() {
  const appUser = await requireAppUser();
  if (!appUser) redirect("/onboarding");
  if (!appUser.companyId && appUser.role !== "CECODES_ADMIN") redirect("/onboarding");

  return <DashboardScreen companyId={appUser.companyId} />;
}
