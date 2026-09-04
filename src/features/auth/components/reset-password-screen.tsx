import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "./auth-card";
import { ResetPasswordForm } from "./reset-password-form";

export async function ResetPasswordScreen({ token }: { token?: string }) {
  const t = await getTranslations("auth.reset");

  // Who is allowed to be asked for their old password. A ?token visitor is anonymous and has none
  // to give: recovery here is always the emailed token, never a session that arrives already
  // signed in, so a session visitor is always somebody who can supply their current password.
  const requireCurrentPassword = !token;

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
