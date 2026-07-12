import { getFormatter, getTranslations } from "next-intl/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EmissionFactorVersion } from "@/lib/generated/prisma/client";
import { VersionDialog } from "./version-dialog";

// The library's change log, mirroring the Excel. Read-only rows plus a "Nueva versión"
// dialog. A version is never edited: a new release is a new row.
export async function VersionsTable({
  versions,
}: {
  versions: EmissionFactorVersion[];
}) {
  const t = await getTranslations("admin.factors.versions");
  const format = await getFormatter();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <VersionDialog />
      </div>

      {versions.length === 0 ? (
        <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("version")}</TableHead>
                <TableHead>{t("date")}</TableHead>
                <TableHead>{t("preparedBy")}</TableHead>
                <TableHead>{t("reviewedBy")}</TableHead>
                <TableHead>{t("authorizedBy")}</TableHead>
                <TableHead>{t("description")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((version) => (
                <TableRow key={version.id}>
                  <TableCell className="font-mono font-medium">{version.version}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {format.dateTime(version.date, { dateStyle: "medium" })}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {version.preparedBy ?? "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {version.reviewedBy ?? "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {version.authorizedBy ?? "-"}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {version.description ?? t("noDescription")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
