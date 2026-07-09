import { getTranslations } from "next-intl/server";
import { OnboardingForm } from "./onboarding-form";

export async function OnboardingScreen() {
  const t = await getTranslations("onboarding");

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>
      <OnboardingForm />
    </div>
  );
}
