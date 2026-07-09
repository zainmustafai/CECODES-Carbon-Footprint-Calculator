import { getTranslations } from "next-intl/server";

type DashboardScreenProps = {
  email?: string;
};

export async function DashboardScreen({ email }: DashboardScreenProps) {
  const t = await getTranslations("dashboard");

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">
        {t("welcome")}
        {email ? `, ${email}` : ""}.
      </p>
    </div>
  );
}
