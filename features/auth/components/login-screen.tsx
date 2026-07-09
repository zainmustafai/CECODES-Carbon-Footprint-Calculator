import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "./auth-card";
import { LoginForm } from "./login-form";

export async function LoginScreen() {
  const t = await getTranslations("auth.login");
  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <div className="flex w-full flex-col gap-2">
          <Link href="/forgot-password" className="text-primary hover:underline">
            {t("forgot")}
          </Link>
          <span>
            {t("noAccount")}{" "}
            <Link href="/register" className="text-primary hover:underline">
              {t("signUp")}
            </Link>
          </span>
        </div>
      }
    >
      <LoginForm />
    </AuthCard>
  );
}
