import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Building2, Download, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { USER_GUIDE_HREF, USER_GUIDE_FILENAME } from "@/lib/user-guide";

// The company's own identity, leading the dashboard - client feedback 2026-09-03: "please use
// company information as header, I mean the first thing the user will visualize is their
// information."
//
// It doubles as the home for the user guide download, which the client asked for in the previous
// round and which had nowhere stable to live: the intro card is dismissed permanently per browser,
// so a button placed only there disappears for anyone who has already clicked "Entendido".
export async function CompanyHeader({
  companyName,
  sector,
  year,
  facilityCount,
  companyProfileHref,
}: {
  companyName: string;
  sector: string | null;
  year: number;
  facilityCount: number;
  companyProfileHref: string;
}) {
  const t = await getTranslations("dashboard.companyHeader");
  const tSectors = await getTranslations("company.sectors");

  // Sectors are stored as slugs and translated; a company onboarded before the list existed can
  // hold any text, so an unknown slug is shown verbatim rather than dropped.
  const sectorLabel = (() => {
    if (!sector) return null;
    try {
      return tSectors(sector);
    } catch {
      return sector;
    }
  })();

  const facts: { label: string; value: string }[] = [
    ...(sectorLabel ? [{ label: t("sector"), value: sectorLabel }] : []),
    { label: t("period"), value: String(year) },
    { label: t("facilities"), value: String(facilityCount) },
  ];

  return (
    <Card>
      <CardContent className="flex flex-wrap items-start justify-between gap-6 pt-6">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 space-y-2">
            <div className="space-y-0.5">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                {t("eyebrow")}
              </p>
              <h2 className="truncate font-semibold text-xl tracking-tight">{companyName}</h2>
            </div>
            <dl className="flex flex-wrap gap-x-6 gap-y-1">
              {facts.map((fact) => (
                <div key={fact.label} className="flex items-baseline gap-1.5">
                  <dt className="text-muted-foreground text-xs">{fact.label}</dt>
                  <dd className="font-medium text-sm">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            {/* A static asset, so a plain anchor: there is nothing to generate and nothing that
                can fail partway, unlike the report downloads that need the fetch-and-blob helper. */}
            <a href={USER_GUIDE_HREF} download={USER_GUIDE_FILENAME}>
              <Download className="size-4" aria-hidden />
              {t("userGuide")}
            </a>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={companyProfileHref}>
              <Pencil className="size-4" aria-hidden />
              {t("edit")}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
