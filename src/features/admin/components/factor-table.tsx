import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EmissionFactor } from "@/lib/generated/prisma/client";
import { FactorRowActions } from "./factor-row-actions";

function scopeNumber(scope: EmissionFactor["scope"]): string {
  return scope === "SCOPE_1" ? "1" : scope === "SCOPE_2" ? "2" : "3";
}

type FactorDisplay = { value: string; unit: string | null; perGas: boolean };

// Picks the one factor to show. Per-gas rows lead with CO2 and flag that other gases exist;
// the consolidated and spend-based factors are shown as-is. A Scope 2 element has none.
function factorDisplay(factor: EmissionFactor): FactorDisplay | null {
  if (factor.co2Factor !== null) {
    return {
      value: factor.co2Factor.toString(),
      unit: factor.factorUnit,
      perGas: factor.ch4Factor !== null || factor.n2oFactor !== null,
    };
  }
  if (factor.co2eFactor !== null) {
    return { value: factor.co2eFactor.toString(), unit: factor.factorUnit, perGas: false };
  }
  if (factor.co2eFactorCop !== null) {
    return { value: factor.co2eFactorCop.toString(), unit: factor.factorUnit, perGas: false };
  }
  if (factor.co2eFactorUsd !== null) {
    return { value: factor.co2eFactorUsd.toString(), unit: factor.factorUnit, perGas: false };
  }
  return null;
}

export async function FactorTable({ factors }: { factors: EmissionFactor[] }) {
  const t = await getTranslations("admin.factors.table");
  const ts = await getTranslations("admin.factors.status");

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("scope")}</TableHead>
            <TableHead>{t("category")}</TableHead>
            <TableHead>{t("element")}</TableHead>
            <TableHead>{t("unit")}</TableHead>
            <TableHead>{t("factor")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead className="w-0 text-right">
              <span className="sr-only">{t("actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {factors.map((factor) => {
            const display = factorDisplay(factor);
            return (
              <TableRow key={factor.id}>
                <TableCell>
                  <Badge variant="secondary">{`${t("scope")} ${scopeNumber(factor.scope)}`}</Badge>
                </TableCell>
                <TableCell className="max-w-56">
                  <div className="min-w-0">
                    <div className="truncate">{factor.category}</div>
                    {factor.subcategory ? (
                      <div className="truncate text-xs text-muted-foreground">
                        {factor.subcategory}
                      </div>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="max-w-72 truncate font-medium">{factor.element}</TableCell>
                <TableCell className="text-muted-foreground">{factor.unit}</TableCell>
                <TableCell>
                  {display ? (
                    <span className="font-mono whitespace-nowrap">
                      {display.value}
                      {display.unit ? (
                        <span className="ml-1 text-xs text-muted-foreground">{display.unit}</span>
                      ) : null}
                      {display.perGas ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({t("perGas")})
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t("noFactor")}</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={factor.active ? "secondary" : "outline"}>
                    {factor.active ? ts("active") : ts("inactive")}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <FactorRowActions
                    factorId={factor.id}
                    element={factor.element}
                    active={factor.active}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
