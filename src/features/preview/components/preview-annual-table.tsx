import { Fragment } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PreviewScopeGroup } from "../lib/types";
import { EstimateCell, FactorCell } from "./preview-cells";

// Scopes 1 and 3: one annual value per source. Rows are grouped by category, each category
// carries its own subtotal, and the scope total sits in the footer.
export async function PreviewAnnualTable({ group }: { group: PreviewScopeGroup }) {
  const t = await getTranslations("preview");
  const format = await getFormatter();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("table.element")}</TableHead>
          <TableHead>{t("table.unit")}</TableHead>
          <TableHead className="text-right">{t("table.quantity")}</TableHead>
          <TableHead className="text-right">{t("table.factor")}</TableHead>
          <TableHead className="text-right">{t("table.tonnes")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {group.categories.map((category) => (
          <Fragment key={category.category}>
            <TableRow className="bg-muted/40">
              <TableCell colSpan={4} className="font-medium">
                {category.category}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {format.number(category.tonnes, { maximumFractionDigits: 2 })}
              </TableCell>
            </TableRow>
            {category.sources.map((source) => (
              <TableRow key={`${category.category}-${source.key}`}>
                <TableCell>
                  <span className="font-medium">{source.element}</span>
                  {source.subcategory ? (
                    <span className="block text-xs text-muted-foreground">
                      {source.subcategory}
                    </span>
                  ) : null}
                  {!source.factorActive ? (
                    <span className="block text-xs text-muted-foreground">
                      {t("inactiveFactor")}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground">{source.unit}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {source.hasQuantity ? (
                    format.number(source.quantity, { maximumFractionDigits: 2 })
                  ) : (
                    <span className="text-muted-foreground">{t("notReported")}</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  <FactorCell estimate={source.estimate} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <EstimateCell estimate={source.estimate} hasQuantity={source.hasQuantity} />
                </TableCell>
              </TableRow>
            ))}
          </Fragment>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={4} className="font-medium">
            {t("scopeTotal")}
          </TableCell>
          <TableCell className="text-right font-semibold tabular-nums">
            {format.number(group.tonnes, { maximumFractionDigits: 2 })} {t("tCO2e")}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
