import { getTranslations } from "next-intl/server";
import { Library } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";

// Placeholder until CECODES delivers the confirmed factor dataset (Requirements section 12).
// It reports what is actually loaded rather than pretending to be a management screen.
export async function FactorLibraryScreen() {
  const t = await getTranslations("admin.factors");

  const [factors, versions, gridFactors] = await Promise.all([
    prisma.emissionFactor.count({ where: { active: true } }),
    prisma.emissionFactorVersion.findFirst({
      orderBy: { date: "desc" },
      select: { version: true },
    }),
    prisma.gridElectricityFactor.count(),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Library className="size-6" aria-hidden />
        </div>
        <Badge variant="outline">{t("comingSoon")}</Badge>
        <p className="text-sm text-muted-foreground">
          {t("loaded", { factors, gridFactors, version: versions?.version ?? "-" })}
        </p>
      </div>
    </div>
  );
}
