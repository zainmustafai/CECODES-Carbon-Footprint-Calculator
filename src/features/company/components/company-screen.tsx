import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { prisma } from "@/lib/prisma";
import { FacilitiesSection } from "@/features/facilities";
import { CompanyProfileForm } from "./company-profile-form";

type CompanyScreenProps = {
  /** Already authorized by the route. The action re-authorizes it anyway. */
  companyId: string;
  /** "/company" for a company user, "/admin/companies/[id]/company" for an admin. */
  basePath: string;
};

// The company workspace on one page: the editable profile up top, then full facilities
// management (add/edit/delete, reporting-year chips). Sedes used to be a separate route and
// sidebar item; folding it in here means one place to manage everything about a company, and
// one fewer place for the facility rules to drift.
export async function CompanyScreen({ companyId, basePath }: CompanyScreenProps) {
  const t = await getTranslations("company");

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, sector: true, contactEmail: true },
  });
  if (!company) notFound();

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

      <Separator />

      <FacilitiesSection companyId={company.id} basePath={basePath} />
    </div>
  );
}
