"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DecimalField } from "@/components/form/decimal-field";
import { useToastAction } from "@/hooks/use-toast-action";
import { isValidEntryValue } from "@/lib/decimal-input";
import type { Scope } from "@/lib/generated/prisma/client";
import { saveScopeTarget } from "../actions/scope-targets";
import { useDataEntryContext } from "../hooks/use-data-entry-context";

// The per-scope reduction target (Meta) for the open reporting year.
//
// It lives here rather than on the dashboard because this is the only screen where the
// facility and the year are in the URL, and ScopeTarget is keyed on the reporting year. The
// dashboard consumes the target and shows progress against it (MetaVsReal, and the target KPI).
//
// Clearing the field deletes the target. An empty target is not a target of zero.
export function MetaCard({ scope, initialValue }: { scope: Scope; initialValue: string }) {
  const t = useTranslations("dataEntry.meta");
  const tScopes = useTranslations("dataEntry.scopes");
  const te = useTranslations("dataEntry.errors");
  const { reportingYearId } = useDataEntryContext();
  const { isPending, run } = useToastAction();

  const [value, setValue] = useState(initialValue);
  const invalid = !isValidEntryValue(value);
  const fieldId = `meta-${scope}`;

  async function onSave() {
    if (!reportingYearId || invalid) return;
    await run(() => saveScopeTarget({ reportingYearId, scope, targetTonnes: value }), {
      loading: t("toasts.saving"),
      success: value.trim() === "" ? t("toasts.cleared") : t("toasts.saved"),
      errorMessage: (key) => te(key),
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-end">
      <div className="flex-1 space-y-1">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Target className="size-4 text-muted-foreground" aria-hidden />
          {t("title")}
        </p>
        <p className="text-xs text-muted-foreground">{t("help")}</p>
      </div>

      <div className="flex items-start gap-2 sm:items-end">
        {/* The wrapper carries the width: DecimalField forwards className to the input, and
            a width there would fight the unit addon inside the InputGroup. */}
        <div className="w-40">
          <DecimalField
            id={fieldId}
            name={fieldId}
            label={t("label", { scope: tScopes(scope) })}
            unit="t CO2e"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            error={invalid ? t("validation.format") : undefined}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          loading={isPending}
          disabled={invalid}
          onClick={onSave}
          className="self-end"
        >
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
