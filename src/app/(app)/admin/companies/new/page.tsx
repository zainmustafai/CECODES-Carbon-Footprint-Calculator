import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/server";
import { CompanyOnboardingWizard } from "@/features/admin";

// A guided flow for standing up a new member company: the company, an optional first sede, and
// an optional first user with a temporary password. requireAdmin() guards rendering; each
// underlying action (createCompany, createFacility, createUser) re-authorizes on its own.
export default async function Page() {
  await requireAdmin();
  const t = await getTranslations("admin.onboarding");

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-muted-foreground">{t("pageSubtitle")}</p>
      </div>
      <CompanyOnboardingWizard />
    </div>
  );
}
