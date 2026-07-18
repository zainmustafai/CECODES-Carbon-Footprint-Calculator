import { getTranslations } from "next-intl/server";
import { FEATURE_SELF_ONBOARDING } from "@/lib/feature-flags";
import { OnboardingForm } from "./onboarding-form";

export async function OnboardingScreen() {
  const t = await getTranslations("onboarding");

  // Self-serve onboarding is closed: CECODES provisions every account (see FEATURE_SELF_ONBOARDING).
  // A user who reaches this screen has no company yet; tell them to contact CECODES rather than
  // offer a form that would create a duplicate.
  if (!FEATURE_SELF_ONBOARDING) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t("blocked.title")}</h1>
        <p className="text-muted-foreground">{t("blocked.body")}</p>
      </div>
    );
  }

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
