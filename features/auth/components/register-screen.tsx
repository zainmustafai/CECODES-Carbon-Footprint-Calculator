import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "./auth-card";
import { RegisterForm } from "./register-form";

export async function RegisterScreen() {
  const t = await getTranslations("auth.register");
  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <span>
          {t("haveAccount")}{" "}
          <Link href="/login" className="text-primary hover:underline">
            {t("signIn")}
          </Link>
        </span>
      }
    >
      <RegisterForm />
    </AuthCard>
  );
}
