import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { TruncatedText } from "@/components/ui/truncated-text";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Scope } from "@/lib/generated/prisma/client";
import type { CachedFactor } from "../lib/factor-library-cache";
import { FactorRowActions } from "./factor-row-actions";

function scopeNumber(scope: Scope): string {
  return scope === "SCOPE_1" ? "1" : scope === "SCOPE_2" ? "2" : "3";
}

type FactorDisplay = { value: string; unit: string | null; perGas: boolean };

// Picks the one factor to show. Per-gas rows lead with CO2 and flag that other gases exist;
// the consolidated and spend-based factors are shown as-is. A Scope 2 element has none. The
// factor fields already crossed as strings from the cached loader.
function factorDisplay(factor: CachedFactor): FactorDisplay | null {
  if (factor.co2Factor !== null) {
    return {
      value: factor.co2Factor,
      unit: factor.factorUnit,
      perGas: factor.ch4Factor !== null || factor.n2oFactor !== null,
    };
  }
  if (factor.co2eFactor !== null) {
    return { value: factor.co2eFactor, unit: factor.factorUnit, perGas: false };
  }
  if (factor.co2eFactorCop !== null) {
    return { value: factor.co2eFactorCop, unit: factor.factorUnit, perGas: false };
  }
  if (factor.co2eFactorUsd !== null) {
    return { value: factor.co2eFactorUsd, unit: factor.factorUnit, perGas: false };
  }
  return null;
}

export async function FactorTable({ factors }: { factors: CachedFactor[] }) {
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
                    <TruncatedText>{factor.category}</TruncatedText>
                    {factor.subcategory ? (
                      <TruncatedText className="text-xs text-muted-foreground">
                        {factor.subcategory}
                      </TruncatedText>
                    ) : null}
                  </div>
                </TableCell>
                {/* The element name is the one that regularly overflows: these come verbatim from
                    the workbook and run past a hundred characters, at which point two different
                    factors can look identical in the column. */}
                <TableCell className="max-w-72 font-medium">
                  <TruncatedText>{factor.element}</TruncatedText>
                </TableCell>
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
