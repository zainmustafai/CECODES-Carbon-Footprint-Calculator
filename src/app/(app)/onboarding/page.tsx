import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth/server";
import { OnboardingScreen } from "@/features/onboarding";

export default async function Page() {
  // Session is guaranteed; a null profile means the row is not present yet, in
  // which case we still show onboarding (the action self-heals the row).
  const appUser = await requireAppUser();
  if (appUser?.companyId) redirect("/dashboard");
  if (appUser?.role === "CECODES_ADMIN") redirect("/dashboard");

  return <OnboardingScreen />;
}
