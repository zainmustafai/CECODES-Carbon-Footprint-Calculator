import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { FACTOR_FIELDS, type FactorDiff } from "../lib/factor-diff";

// The audit trail for one factor: who changed what, and when. Each row shows the action, the
// timestamp, the actor, and one line per changed field of the form "Label: before -> after".
export async function FactorHistory({ factorId }: { factorId: string }) {
  const t = await getTranslations("admin.factors.history");
  const tf = await getTranslations("admin.factors.fields");
  const ta = await getTranslations("admin.factors.changeActions");
  const format = await getFormatter();

  const changes = await prisma.emissionFactorChange.findMany({
    where: { factorId },
    orderBy: { changedAt: "desc" },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        {changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ol className="space-y-5">
            {changes.map((change) => {
              const diff = (change.changes ?? {}) as unknown as FactorDiff;
              const fields = FACTOR_FIELDS.filter((field) => diff[field]);
              return (
                <li key={change.id} className="border-l-2 border-border pl-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={change.action === "DEACTIVATED" ? "outline" : "secondary"}>
                      {ta(change.action)}
                    </Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {format.dateTime(change.changedAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("by", { email: change.changedByEmail })}
                    </span>
                  </div>
                  {fields.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {fields.map((field) => {
                        const entry = diff[field]!;
                        return (
                          <li key={field} className="font-mono text-xs">
                            <span className="text-foreground">{tf(field)}</span>
                            <span className="text-muted-foreground">
                              {`: ${entry.from ?? t("emptyValue")} -> ${entry.to ?? t("emptyValue")}`}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
