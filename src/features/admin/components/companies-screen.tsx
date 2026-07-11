import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Building2, ClipboardList, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { isKnownSector } from "@/lib/sectors";
import { cn } from "@/lib/utils";
import { CompanyDialog } from "./company-dialog";
import { CompanyRowActions } from "./company-row-actions";

// The admin's home. Drilling into a company opens the exact same workspace screens a company
// user sees, scoped to that company, rather than a parallel admin-only implementation. The
// data-entry and dashboard links stay available for inactive companies too, so an admin can
// go in and fix things before reactivating.
export async function CompaniesScreen() {
  const t = await getTranslations("admin.companies");
  const tSectors = await getTranslations("company.sectors");

  const companies = await prisma.company.findMany({
    // Active first, then alphabetical, so inactive companies sort last.
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      sector: true,
      active: true,
      _count: { select: { facilities: true, users: true } },
    },
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <CompanyDialog />
      </div>

      {companies.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Building2 className="size-6" aria-hidden />
          </div>
          <p className="font-medium">{t("emptyTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("emptyBody")}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {companies.map((company) => {
            // A known slug is translated; a legacy free-text sector is shown verbatim.
            const sectorLabel = company.sector
              ? isKnownSector(company.sector)
                ? tSectors(company.sector)
                : company.sector
              : t("noSector");

            return (
              <Card
                key={company.id}
                className={cn(!company.active && "bg-muted/30 opacity-75")}
              >
                <CardContent className="space-y-4 pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{company.name}</p>
                        {!company.active ? (
                          <Badge variant="outline" className="shrink-0">
                            {t("inactiveBadge")}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {sectorLabel}
                      </p>
                    </div>
                    <CompanyRowActions company={company} />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="gap-1.5 tabular-nums">
                      <MapPin className="size-3" aria-hidden />
                      {t("facilityCount", { count: company._count.facilities })}
                    </Badge>
                    <Badge variant="secondary" className="gap-1.5 tabular-nums">
                      <Users className="size-3" aria-hidden />
                      {t("userCount", { count: company._count.users })}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/companies/${company.id}/data-entry`}>
                        <ClipboardList className="size-4" aria-hidden />
                        {t("openDataEntry")}
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/admin/companies/${company.id}/dashboard`}>
                        {t("open")}
                        <ArrowRight className="size-4" aria-hidden />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
