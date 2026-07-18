import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadEntryChanges } from "../lib/load-entry-changes";

// "Who did what": the data-entry audit trail for the selected sede-year. Answers CECODES's
// traceability need, a wrong figure points back to a person. Read-only and append-only.
export async function EntryChangeLog({
  companyId,
  facilityId,
  year,
}: {
  companyId: string;
  facilityId: string | null;
  year: number | null;
}) {
  const t = await getTranslations("preview.changes");
  const tm = await getTranslations("dataEntry.months");
  const format = await getFormatter();

  const rows = await loadEntryChanges(companyId, facilityId, year);
  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3 text-sm">
              <Badge variant="secondary" className="shrink-0">
                {t(`actions.${row.action}`)}
              </Badge>
              <span className="font-medium">{row.element}</span>
              {row.month ? (
                <span className="text-muted-foreground">{tm(String(row.month))}</span>
              ) : null}
              {row.action === "VALUE_SET" || row.action === "VALUE_CLEARED" ? (
                <span className="tabular-nums text-muted-foreground">
                  {row.from ?? t("blank")} {"->"} {row.to ?? t("blank")}
                </span>
              ) : null}
              <span className="ml-auto shrink-0 text-muted-foreground">
                {t("by", { who: row.who })}
                {" · "}
                {/* es-CO product: pin the zone so the timestamp is stable and localized. */}
                {format.dateTime(row.changedAt, {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "America/Bogota",
                })}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
