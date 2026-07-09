import { getTranslations } from "next-intl/server";
import { AuthCard } from "./auth-card";
import { ResetPasswordForm } from "./reset-password-form";

export async function ResetPasswordScreen() {
  const t = await getTranslations("auth.reset");
  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      <ResetPasswordForm />
    </AuthCard>
  );
}
