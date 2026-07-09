import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";

type DashboardScreenProps = {
  email?: string;
  companyId?: string | null;
};

export async function DashboardScreen({ email, companyId }: DashboardScreenProps) {
  const t = await getTranslations("dashboard");

  const company = companyId
    ? await prisma.company.findUnique({
        where: { id: companyId },
        include: { facilities: { orderBy: { createdAt: "asc" } } },
      })
    : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">
          {email ? t("welcome", { email }) : t("welcomeNoEmail")}
        </p>
      </div>

      {company ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{t("company")}</p>
          <p className="text-lg font-medium">{company.name}</p>
          <ul className="text-sm text-muted-foreground">
            {company.facilities.map((f) => (
              <li key={f.id}>
                {f.name} · {f.location}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
