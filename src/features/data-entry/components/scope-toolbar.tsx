"use client";

import { useTranslations } from "next-intl";

// The quiet chrome of a scope panel: the format rule for every number on it.
//
// It MUST live inside the panel, not above the Tabs: Radix unmounts the inactive TabsContent,
// and every field in this panel points at this paragraph through aria-describedby. Hoisted to
// the screen, the idrefs of the two hidden panels would dangle.
export function ScopeToolbar({ hintId }: { hintId: string }) {
  const t = useTranslations("dataEntry");

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <p id={hintId} className="text-xs text-muted-foreground">
        {t("valueHint")}
      </p>
    </div>
  );
}
