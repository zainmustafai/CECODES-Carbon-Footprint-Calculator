"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Info, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DecimalField } from "@/components/form/decimal-field";
import { useToastAction } from "@/hooks/use-toast-action";
import { isValidEntryValue } from "@/lib/decimal-input";
import type { Scope } from "@/lib/generated/prisma/client";
import { saveScopeTarget } from "../actions/scope-targets";
import { useDataEntryContext } from "../hooks/use-data-entry-context";

// The per-scope reduction target (Meta) for the open reporting year.
//
// It lives on this screen rather than the dashboard because this is the only screen where the
// facility and the year are in the URL, and ScopeTarget is keyed on the reporting year. The
// dashboard consumes the target and shows progress against it.
//
// It used to be a full card with a title and a paragraph of help, repeated on all three scope
// tabs. The Meta is real, but it is not the task this screen exists for, so it is now a single
// row and its explanation sits behind an info button. The field itself stays a real, labelled
// DecimalField: hiding it behind a disclosure would take it out of the DOM for no design gain.
//
// Clearing the field deletes the target. An empty target is not a target of zero.
export function MetaRow({ scope, initialValue }: { scope: Scope; initialValue: string }) {
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
    <div className="flex flex-wrap items-end gap-2">
      {/* The wrapper carries the width: DecimalField forwards className to the input, and a
          width there would fight the unit addon inside the InputGroup. */}
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
      >
        {t("save")}
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label={t("helpAria")}>
            <Info className="size-4" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 gap-2">
          <PopoverTitle className="flex items-center gap-2">
            <Target className="size-4 text-muted-foreground" aria-hidden />
            {t("title")}
          </PopoverTitle>
          <p className="text-xs text-muted-foreground">{t("help")}</p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
