import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "./auth-card";
import { LoginForm } from "./login-form";

export async function LoginScreen() {
  const t = await getTranslations("auth.login");
  const tc = await getTranslations("auth.common");

  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <div className="w-full space-y-4">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span>{tc("or")}</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <p className="text-center">
            {t("noAccount")}{" "}
            <Link
              href="/register"
              className="font-medium text-primary hover:underline"
            >
              {t("signUp")}
            </Link>
          </p>
        </div>
      }
    >
      <LoginForm />
    </AuthCard>
  );
}
