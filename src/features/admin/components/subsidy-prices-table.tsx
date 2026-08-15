"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmActionDialog } from "@/components/feedback/confirm-action-dialog";
import { SubsidyPriceDialog } from "./subsidy-price-dialog";
import { useSubsidyPriceDelete } from "../hooks/use-subsidy-price-form";

export type SubsidyPriceRow = {
  year: number;
  pricePerGallonCop: string;
  source: string | null;
  updatedByEmail: string | null;
  updatedAt: string;
};

export function SubsidyPricesTable({ subsidyPrices }: { subsidyPrices: SubsidyPriceRow[] }) {
  const t = useTranslations("admin.factors.subsidy");
  const tc = useTranslations("common");
  const format = useFormatter();
  const { isPending, remove } = useSubsidyPriceDelete();

  if (subsidyPrices.length === 0) {
    return (
      <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("year")}</TableHead>
            <TableHead>{t("price")}</TableHead>
            <TableHead>{t("source")}</TableHead>
            <TableHead>{t("updatedBy")}</TableHead>
            <TableHead>{t("updatedAt")}</TableHead>
            <TableHead className="w-0 text-right">
              <span className="sr-only">{tc("actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {subsidyPrices.map((row) => (
            <TableRow key={row.year}>
              <TableCell className="font-medium tabular-nums">{row.year}</TableCell>
              <TableCell className="font-mono whitespace-nowrap">
                {row.pricePerGallonCop}
                <span className="ml-1 text-xs text-muted-foreground">{t("priceUnit")}</span>
              </TableCell>
              <TableCell className="text-muted-foreground">{row.source ?? "-"}</TableCell>
              <TableCell className="text-muted-foreground">
                {row.updatedByEmail ?? t("never")}
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">
                {row.updatedByEmail
                  ? format.dateTime(new Date(row.updatedAt), { dateStyle: "medium" })
                  : t("never")}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <SubsidyPriceDialog
                    subsidyPrice={{
                      year: String(row.year),
                      pricePerGallonCop: row.pricePerGallonCop,
                      source: row.source ?? "",
                    }}
                  />
                  <ConfirmActionDialog
                    trigger={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${t("delete")}: ${row.year}`}
                      >
                        <Trash2 className="size-4 text-muted-foreground" aria-hidden />
                      </Button>
                    }
                    title={t("deleteDialog.title", { year: String(row.year) })}
                    description={t("deleteDialog.body")}
                    cancelLabel={t("deleteDialog.cancel")}
                    confirmLabel={t("deleteDialog.confirm")}
                    pending={isPending}
                    onConfirm={() => remove(row.year)}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
