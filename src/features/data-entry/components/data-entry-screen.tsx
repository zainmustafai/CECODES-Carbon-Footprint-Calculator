import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarRange, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { groupFactors } from "../lib/group-factors";
import { shapeEntries, type EntryRow } from "../lib/shape-entries";
import type { FacilityVM, YearVM } from "../lib/types";
import { ContextBar } from "./context-bar";
import { CreateYearDialog } from "./create-year-dialog";
import { DataEntryProvider } from "./data-entry-provider";
import { ScopeTabs } from "./scope-tabs";

type DataEntryScreenProps = {
  /** Already authorized by the route via resolveCompanyScope. Every query below re-scopes on it. */
  companyId: string;
  basePath: string;
  searchParams: { facilityId?: string; year?: string };
};

export async function DataEntryScreen({
  companyId,
  basePath,
  searchParams,
}: DataEntryScreenProps) {
  const t = await getTranslations("dataEntry");

  const facilities: FacilityVM[] = await prisma.facility.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, location: true },
  });

  // A facilityId from the query string is only honoured if it belongs to this company.
  const selectedFacility =
    facilities.find((f) => f.id === searchParams.facilityId) ?? facilities[0] ?? null;

  const years: YearVM[] = selectedFacility
    ? await prisma.reportingYear.findMany({
        where: { facilityId: selectedFacility.id, companyId },
        orderBy: { year: "desc" },
        select: { id: true, year: true, gwpSet: true },
      })
    : [];

  const requestedYear = Number(searchParams.year);
  const selectedYear =
    years.find((y) => y.year === requestedYear) ?? years[0] ?? null;

  const header = (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground">{t("subtitle")}</p>
    </div>
  );

  if (!selectedFacility) {
    return (
      <div className="space-y-8">
        {header}
        <EmptyState
          icon={<MapPin className="size-6" />}
          title={t("empty.noFacilityTitle")}
          body={t("empty.noFacilityBody")}
          action={
            <Button asChild>
              <Link href={basePath.replace(/\/data-entry$/, "/facilities")}>
                {t("empty.goToFacilities")}
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (!selectedYear) {
    return (
      <div className="space-y-8">
        {header}
        <ContextBarShell
          basePath={basePath}
          facilities={facilities}
          years={years}
          selectedFacilityId={selectedFacility.id}
        />
        <EmptyState
          icon={<CalendarRange className="size-6" />}
          title={t("empty.noYearTitle")}
          body={t("empty.noYearBody", { facility: selectedFacility.name })}
          action={
            <CreateYearDialog
              facilityId={selectedFacility.id}
              basePath={basePath}
              variant="default"
            />
          }
        />
      </div>
    );
  }

  const [entries, applicability, factors, gridFactor, targets] = await Promise.all([
    prisma.activityEntry.findMany({
      where: { reportingYearId: selectedYear.id, companyId },
      orderBy: [{ category: "asc" }, { element: "asc" }, { month: "asc" }],
      select: {
        id: true,
        emissionFactorId: true,
        scope: true,
        category: true,
        subcategory: true,
        element: true,
        unit: true,
        month: true,
        value: true,
        emissionFactor: {
          select: {
            active: true,
            biogenic: true,
            // Feeds the per-source estimated-emissions summary. Decimals, so stringify below.
            co2Factor: true,
            ch4Factor: true,
            n2oFactor: true,
            co2eFactor: true,
            factorUnit: true,
            source: true,
          },
        },
      },
    }),
    prisma.categoryApplicability.findMany({
      where: { reportingYearId: selectedYear.id, companyId },
      select: { scope: true, category: true, applies: true },
    }),
    prisma.emissionFactor.findMany({
      where: { active: true },
      orderBy: [
        { scope: "asc" },
        { category: "asc" },
        { subcategory: "asc" },
        { element: "asc" },
      ],
      select: {
        id: true,
        scope: true,
        category: true,
        subcategory: true,
        element: true,
        unit: true,
        biogenic: true,
      },
    }),
    prisma.gridElectricityFactor.findUnique({
      where: { year: selectedYear.year },
      select: { factor: true, source: true },
    }),
    prisma.scopeTarget.findMany({
      where: { reportingYearId: selectedYear.id, companyId },
      select: { scope: true, targetTonnes: true },
    }),
  ]);

  // Prisma hands back decimal.js instances, which are not serializable to a Client
  // Component. They become strings here and stay strings all the way to the input and back.
  // Number() would reintroduce exactly the float rounding the old tool suffered from.
  const entryRows: EntryRow[] = entries.map((entry) => ({
    id: entry.id,
    emissionFactorId: entry.emissionFactorId,
    scope: entry.scope,
    category: entry.category,
    subcategory: entry.subcategory,
    element: entry.element,
    unit: entry.unit,
    month: entry.month,
    value: entry.value === null ? "" : entry.value.toString(),
    factorActive: entry.emissionFactor?.active ?? false,
    biogenic: entry.emissionFactor?.biogenic ?? false,
    factor: entry.emissionFactor
      ? {
          co2Factor: entry.emissionFactor.co2Factor?.toString() ?? null,
          ch4Factor: entry.emissionFactor.ch4Factor?.toString() ?? null,
          n2oFactor: entry.emissionFactor.n2oFactor?.toString() ?? null,
          co2eFactor: entry.emissionFactor.co2eFactor?.toString() ?? null,
          biogenic: entry.emissionFactor.biogenic,
          factorUnit: entry.emissionFactor.factorUnit,
          source: entry.emissionFactor.source,
        }
      : null,
  }));

  const grouped = groupFactors(factors);
  const scopes = shapeEntries(entryRows, applicability, grouped);
  const initialValues = Object.fromEntries(entryRows.map((e) => [e.id, e.value]));

  const gridFactorVM = gridFactor
    ? { factor: gridFactor.factor.toString(), source: gridFactor.source }
    : null;

  const targetsByScope: Record<string, string> = Object.fromEntries(
    targets.map((target) => [target.scope, target.targetTonnes.toString()]),
  );

  return (
    <div className="space-y-8">
      {header}
      <DataEntryProvider
        reportingYearId={selectedYear.id}
        basePath={basePath}
        initialValues={initialValues}
      >
        <ContextBar
          basePath={basePath}
          facilities={facilities}
          years={years}
          selectedFacilityId={selectedFacility.id}
          selectedYear={selectedYear.year}
        />
        <ScopeTabs
          scopes={scopes}
          grouped={grouped}
          missingGridFactorYear={gridFactor ? null : selectedYear.year}
          gridFactor={gridFactorVM}
          gwpSet={selectedYear.gwpSet}
          year={selectedYear.year}
          targets={targetsByScope}
        />
      </DataEntryProvider>
    </div>
  );
}

// The context bar needs the provider for its save indicator, even before a year exists.
function ContextBarShell({
  basePath,
  facilities,
  years,
  selectedFacilityId,
}: {
  basePath: string;
  facilities: FacilityVM[];
  years: YearVM[];
  selectedFacilityId: string;
}) {
  return (
    <DataEntryProvider reportingYearId={null} basePath={basePath} initialValues={{}}>
      <ContextBar
        basePath={basePath}
        facilities={facilities}
        years={years}
        selectedFacilityId={selectedFacilityId}
        selectedYear={null}
        showCreateYear={false}
      />
    </DataEntryProvider>
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </div>
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
      <div className="mt-2">{action}</div>
    </div>
  );
}
