import { getFormatter, getTranslations } from "next-intl/server";
import { isValidEntryValue, normalizeDecimalInput } from "@/lib/decimal-input";
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
import { NO_VALUE } from "../lib/no-value";
import { EstimateCell } from "./preview-cells";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

// Scope 2: electricity is captured monthly, so it reads as a matrix (one column per month)
// rather than a single annual figure. The table scrolls horizontally on narrow screens.
export async function PreviewMonthlyTable({ group }: { group: PreviewScopeGroup }) {
  const t = await getTranslations("preview");
  const tm = await getTranslations("preview.monthsShort");
  const format = await getFormatter();

  const cell = (value: string) => {
    if (value === "") return <span className="text-muted-foreground">{NO_VALUE}</span>;
    const normalized = normalizeDecimalInput(value);
    if (normalized === "" || !isValidEntryValue(normalized)) return value;
    const parsed = Number(normalized);
    return Number.isFinite(parsed)
      ? format.number(parsed, { maximumFractionDigits: 0 })
      : value;
  };

  const sources = group.categories.flatMap((category) => category.sources);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="sticky left-0 bg-background">{t("table.source")}</TableHead>
          {MONTHS.map((month) => (
            <TableHead key={month} className="text-right">
              {tm(String(month))}
            </TableHead>
          ))}
          <TableHead className="text-right">{t("table.total")}</TableHead>
          <TableHead className="text-right">{t("table.tonnes")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sources.map((source) => (
          <TableRow key={source.key}>
            <TableCell className="sticky left-0 bg-background">
              <span className="font-medium">{source.element}</span>
              <span className="block text-xs text-muted-foreground">{source.unit}</span>
              {!source.factorActive ? (
                <span className="block text-xs text-muted-foreground">
                  {t("inactiveFactor")}
                </span>
              ) : null}
            </TableCell>
            {MONTHS.map((month) => (
              <TableCell key={month} className="text-right tabular-nums">
                {cell(source.monthly[month - 1] ?? "")}
              </TableCell>
            ))}
            <TableCell className="text-right font-medium tabular-nums">
              {source.hasQuantity
                ? format.number(source.quantity, { maximumFractionDigits: 0 })
                : NO_VALUE}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <EstimateCell estimate={source.estimate} hasQuantity={source.hasQuantity} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={14} className="font-medium">
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
