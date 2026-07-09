import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "./auth-card";
import { ForgotPasswordForm } from "./forgot-password-form";

export async function ForgotPasswordScreen() {
  const t = await getTranslations("auth.forgot");
  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <Link href="/login" className="text-primary hover:underline">
          {t("backToLogin")}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
