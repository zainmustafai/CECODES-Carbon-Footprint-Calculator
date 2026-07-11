import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { FactorForm } from "./factor-form";
import type { FactorFormValues } from "../schemas/factor-schemas";

// The distinct category and subcategory values feed the form datalists, which stop
// picker-grouping typos. Shared with the edit screen.
export async function getFactorDatalists(): Promise<{
  categories: string[];
  subcategories: string[];
}> {
  const [categoryRows, subcategoryRows] = await Promise.all([
    prisma.emissionFactor.findMany({
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    }),
    prisma.emissionFactor.findMany({
      where: { subcategory: { not: null } },
      distinct: ["subcategory"],
      select: { subcategory: true },
      orderBy: { subcategory: "asc" },
    }),
  ]);
  return {
    categories: categoryRows.map((row) => row.category),
    subcategories: subcategoryRows
      .map((row) => row.subcategory)
      .filter((value): value is string => value !== null),
  };
}

const EMPTY_FACTOR: FactorFormValues = {
  scope: "",
  category: "",
  subcategory: "",
  element: "",
  unit: "",
  co2Factor: "",
  ch4Factor: "",
  n2oFactor: "",
  co2eFactor: "",
  co2eFactorCop: "",
  co2eFactorUsd: "",
  factorUnit: "",
  source: "",
  gwpSet: "",
  biogenic: false,
  uncertaintyPct: "",
  effectiveYear: "",
  active: true,
};

export async function FactorFormScreen() {
  const t = await getTranslations("admin.factors");
  const { categories, subcategories } = await getFactorDatalists();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/admin/factors">
            <ArrowLeft className="size-4" aria-hidden />
            {t("backToLibrary")}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{t("createTitle")}</h1>
        <p className="text-muted-foreground">{t("createSubtitle")}</p>
      </div>
      <FactorForm
        mode="create"
        defaultValues={EMPTY_FACTOR}
        categories={categories}
        subcategories={subcategories}
      />
    </div>
  );
}
