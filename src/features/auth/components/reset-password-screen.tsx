import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { authProvider } from "@/lib/env";
import { AuthCard } from "./auth-card";
import { ResetPasswordForm } from "./reset-password-form";

export async function ResetPasswordScreen({ token }: { token?: string }) {
  const t = await getTranslations("auth.reset");

  // Who is allowed to be asked for their old password, decided here because it depends on the
  // provider. A ?token visitor is anonymous and has none to give. A session visitor under supabase
  // or shadow arrived through GoTrue's recovery link, which exists precisely for people who cannot
  // supply it. That leaves the one case where re-authentication is both possible and worth having:
  // a signed-in user under AUTH_PROVIDER=local, where recovery never comes with a session.
  const requireCurrentPassword = !token && authProvider() === "local";

  // Only the emailed flow gets a way out. A signed-in user changing their password still has the
  // whole app behind this card; someone who arrived on a link that turns out to be expired has
  // nothing but a form that will keep refusing, and the only thing that helps them is a new link.
  const footer = token ? (
    <Link href="/forgot-password" className="text-primary hover:underline">
      {t("requestNewLink")}
    </Link>
  ) : undefined;

  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")} footer={footer}>
      <ResetPasswordForm token={token} requireCurrentPassword={requireCurrentPassword} />
    </AuthCard>
  );
}
