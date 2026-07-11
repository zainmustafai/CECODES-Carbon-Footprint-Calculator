import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { CompanyProfileForm } from "./company-profile-form";

type CompanyProfileScreenProps = {
  /** Already authorized by the route. The action re-authorizes it anyway. */
  companyId: string;
  /** "/company" for a company user, "/admin/companies/[id]/company" for an admin. */
  basePath: string;
};

// The company profile: name, sector, contact, plus a read-only summary of its plantas.
//
// Facility CRUD is NOT duplicated here. The Sedes screen already owns it, and two places to
// create a facility means two places for its rules to drift apart.
//
// The mockup's "Principal" badge is deliberately absent: there is no isPrimary column, and
// inventing one to render a badge would be the tail wagging the dog.
export async function CompanyProfileScreen({
  companyId,
  basePath,
}: CompanyProfileScreenProps) {
  const t = await getTranslations("company");

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      sector: true,
      contactEmail: true,
      facilities: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          location: true,
          reportingYears: { orderBy: { year: "desc" }, select: { id: true, year: true } },
        },
      },
    },
  });
  if (!company) notFound();

  const facilitiesHref = basePath.replace(/\/company$/, "/facilities");

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <CompanyProfileForm
        companyId={company.id}
        name={company.name}
        sector={company.sector}
        contactEmail={company.contactEmail}
      />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>{t("facilitiesTitle")}</CardTitle>
            <CardDescription>{t("facilitiesSubtitle")}</CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="outline" className="tabular-nums">
              {t("facilityCount", { count: company.facilities.length })}
            </Badge>
            <Button asChild variant="outline" size="sm">
              <Link href={facilitiesHref}>{t("openFacilities")}</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {company.facilities.length === 0 ? (
            <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
              {t("noFacilities")}
            </p>
          ) : (
            <ul className="divide-y">
              {company.facilities.map((facility) => (
                <li
                  key={facility.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{facility.name}</p>
                    <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0" aria-hidden />
                      {facility.location}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {facility.reportingYears.length === 0 ? (
                      <span className="text-xs text-muted-foreground">{t("noYears")}</span>
                    ) : (
                      facility.reportingYears.map((year) => (
                        <Badge key={year.id} variant="secondary" className="tabular-nums">
                          {/* String: ICU would format 2024 as "2.024". */}
                          {String(year.year)}
                        </Badge>
                      ))
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
