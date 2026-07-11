import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ClipboardList, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { FacilityDialog } from "./facility-dialog";
import { DeleteFacilityButton } from "./delete-facility-button";
import { YearChips } from "./year-chips";

type FacilitiesScreenProps = {
  /** Already authorized by the route. Every query re-scopes on it. */
  companyId: string;
  basePath: string;
};

export async function FacilitiesScreen({ companyId, basePath }: FacilitiesScreenProps) {
  const t = await getTranslations("facilities");

  // The years themselves, not just their count: each chip must state how many activity
  // records its deletion would take with it.
  const facilities = await prisma.facility.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      location: true,
      reportingYears: {
        orderBy: { year: "desc" },
        select: { id: true, year: true, _count: { select: { entries: true } } },
      },
    },
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          {/* tabIndex -1 so focus can return here after a facility card unmounts. */}
          <h1
            id="facilities-heading"
            tabIndex={-1}
            className="text-2xl font-semibold tracking-tight outline-none"
          >
            {t("title")}
          </h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <FacilityDialog companyId={companyId} />
      </div>

      {facilities.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MapPin className="size-6" aria-hidden />
          </div>
          <p className="font-medium">{t("emptyTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("emptyBody")}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {facilities.map((facility) => (
            <Card key={facility.id}>
              <CardContent className="space-y-4 pt-6">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate font-medium">{facility.name}</p>
                    <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0" aria-hidden />
                      {facility.location}
                    </p>
                  </div>
                  <div className="flex shrink-0">
                    <FacilityDialog companyId={companyId} facility={facility} />
                    <DeleteFacilityButton facilityId={facility.id} name={facility.name} />
                  </div>
                </div>

                <YearChips
                  facilityName={facility.name}
                  years={facility.reportingYears.map((year) => ({
                    id: year.id,
                    year: year.year,
                    entryCount: year._count.entries,
                  }))}
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="outline" className="tabular-nums">
                    {t("yearCount", { count: facility.reportingYears.length })}
                  </Badge>
                  <Button asChild variant="ghost" size="sm">
                    <Link
                      href={`${basePath.replace(/\/facilities$/, "/data-entry")}?facilityId=${facility.id}`}
                    >
                      <ClipboardList className="size-4" aria-hidden />
                      {t("openDataEntry")}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
