import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { FactorForm } from "./factor-form";
import { FactorHistory } from "./factor-history";
import { getFactorDatalists } from "./factor-form-screen";
import type { FactorFormValues } from "../schemas/factor-schemas";

// Prisma Decimals cannot cross into the client form, so each is serialized to a string. A
// null becomes "", which the form treats as "not set".
function decimalToString(value: { toString(): string } | null): string {
  return value === null ? "" : value.toString();
}

export async function FactorDetailScreen({ factorId }: { factorId: string }) {
  const t = await getTranslations("admin.factors");

  const factor = await prisma.emissionFactor.findUnique({ where: { id: factorId } });
  if (!factor) notFound();

  const { categories, subcategories } = await getFactorDatalists();

  const defaultValues: FactorFormValues = {
    scope: factor.scope,
    category: factor.category,
    subcategory: factor.subcategory ?? "",
    element: factor.element,
    unit: factor.unit,
    co2Factor: decimalToString(factor.co2Factor),
    ch4Factor: decimalToString(factor.ch4Factor),
    n2oFactor: decimalToString(factor.n2oFactor),
    co2eFactor: decimalToString(factor.co2eFactor),
    co2eFactorCop: decimalToString(factor.co2eFactorCop),
    co2eFactorUsd: decimalToString(factor.co2eFactorUsd),
    factorUnit: factor.factorUnit ?? "",
    source: factor.source ?? "",
    gwpSet: factor.gwpSet ?? "",
    biogenic: factor.biogenic,
    uncertaintyPct: decimalToString(factor.uncertaintyPct),
    effectiveYear: factor.effectiveYear !== null ? String(factor.effectiveYear) : "",
    active: factor.active,
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/admin/factors">
            <ArrowLeft className="size-4" aria-hidden />
            {t("backToLibrary")}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{t("editTitle")}</h1>
        <p className="text-muted-foreground">{t("editSubtitle")}</p>
      </div>
      <FactorForm
        mode="edit"
        factorId={factor.id}
        defaultValues={defaultValues}
        categories={categories}
        subcategories={subcategories}
      />
      <FactorHistory factorId={factor.id} />
    </div>
  );
}
