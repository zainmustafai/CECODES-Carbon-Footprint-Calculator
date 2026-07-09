import { getTranslations } from "next-intl/server";
import { Building2, Factory, Flame, Gauge, Truck, Zap } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DashboardScreenProps = {
  companyId?: string | null;
};

export async function DashboardScreen({ companyId }: DashboardScreenProps) {
  const t = await getTranslations("dashboard");

  const company = companyId
    ? await prisma.company.findUnique({
        where: { id: companyId },
        include: { facilities: { orderBy: { createdAt: "asc" } } },
      })
    : null;

  const stats = [
    { key: "totalFootprint", icon: Gauge, color: "text-primary" },
    { key: "scope1", icon: Flame, color: "text-chart-1" },
    { key: "scope2", icon: Zap, color: "text-chart-2" },
    { key: "scope3", icon: Truck, color: "text-chart-3" },
  ] as const;

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ key, icon: Icon, color }) => (
          <Card key={key}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t(key)}
                </p>
                <Icon className={cn("size-4", color)} />
              </div>
              <p className="mt-2 text-3xl font-semibold tabular-nums">0.0</p>
              <p className="text-xs text-muted-foreground">
                {t("tCo2e")} · {t("noData")}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Company + empty state */}
      <div className="grid gap-6 lg:grid-cols-3">
        {company ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="size-4 text-muted-foreground" />
                {t("company")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-lg font-medium">{company.name}</p>
                {company.sector ? (
                  <p className="text-sm text-muted-foreground">
                    {t("sector")}: {company.sector}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("facilities")}
                </p>
                <ul className="space-y-2">
                  {company.facilities.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 text-sm">
                      <Factory className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="font-medium">{f.name}</span>
                      <span className="text-muted-foreground">{f.location}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card className={cn(company ? "lg:col-span-2" : "lg:col-span-3")}>
          <CardContent className="flex min-h-56 flex-col items-center justify-center gap-3 py-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Gauge className="size-6" />
            </div>
            <p className="font-medium">{t("emptyTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("emptyBody")}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
