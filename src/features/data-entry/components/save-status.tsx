"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useSaveStatus } from "../hooks/use-save-status";

// One indicator for the whole screen: saving while any batch is in flight, then the time of
// the last confirmed save. There is no Guardar button, and a year of data is far too many
// fields to trust to one the user might never press.
//
// The live region is the OUTER span, mounted from the first render and never unmounted. A
// screen reader only announces changes to a region that already existed, so putting
// role="status" on the swapped-in element (which is what this component used to do) silently
// dropped the first announcement, including every "Guardando...".
//
// Autosave never toasts on success. This pill is its feedback; a toast every 700ms would be
// noise. Failures do toast, from the store's rollback path.
export function SaveStatus() {
  const t = useTranslations("dataEntry.save");
  const format = useFormatter();
  const status = useSaveStatus();

  return (
    <span
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        "flex items-center gap-1.5 text-xs",
        status.kind === "error" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {status.kind === "idle" ? t("autosave") : null}

      {status.kind === "saving" ? (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {t("saving")}
        </>
      ) : null}

      {status.kind === "error" ? (
        <>
          <AlertCircle className="size-3.5" aria-hidden />
          {t("error")}
        </>
      ) : null}

      {status.kind === "saved" ? (
        <>
          <Check className="size-3.5 text-primary" aria-hidden />
          {t("saved", {
            time: format.dateTime(new Date(status.at), {
              hour: "2-digit",
              minute: "2-digit",
            }),
          })}
        </>
      ) : null}
    </span>
  );
}
