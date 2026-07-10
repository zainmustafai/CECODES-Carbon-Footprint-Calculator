"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useSaveStatus } from "../hooks/use-save-status";

// One indicator for the whole screen: saving while any batch is in flight, then the time of
// the last confirmed save. There is no Guardar button, and a year of data is far too many
// fields to trust to one the user might never press.
export function SaveStatus() {
  const t = useTranslations("dataEntry.save");
  const format = useFormatter();
  const status = useSaveStatus();

  if (status.kind === "idle") {
    return <span className="text-xs text-muted-foreground">{t("autosave")}</span>;
  }

  if (status.kind === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        {t("saving")}
      </span>
    );
  }

  if (status.kind === "error") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive" role="status">
        <AlertCircle className="size-3.5" aria-hidden />
        {t("error")}
      </span>
    );
  }

  const time = format.dateTime(new Date(status.at), { hour: "2-digit", minute: "2-digit" });
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
      <Check className="size-3.5 text-primary" aria-hidden />
      {t("saved", { time })}
    </span>
  );
}
