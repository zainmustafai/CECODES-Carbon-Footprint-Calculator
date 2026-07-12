"use client";

import { useTranslations } from "next-intl";
import { FEATURE_SCOPE_TARGETS } from "@/lib/feature-flags";
import type { Scope } from "@/lib/generated/prisma/client";
import { MetaRow } from "./meta-row";

// The quiet chrome of a scope panel: the format rule for every number on it, and the Meta.
//
// The format hint used to be repeated once per category (and once per monthly source), which is
// the same sentence four or five times down a page. It is stated once here instead.
//
// It MUST live inside the panel, not above the Tabs: Radix unmounts the inactive TabsContent,
// and every field in this panel points at this paragraph through aria-describedby. Hoisted to
// the screen, the idrefs of the two hidden panels would dangle.
export function ScopeToolbar({
  scope,
  hintId,
  target,
}: {
  scope: Scope;
  hintId: string;
  target: string;
}) {
  const t = useTranslations("dataEntry");

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <p id={hintId} className="text-xs text-muted-foreground">
        {t("valueHint")}
      </p>
      {FEATURE_SCOPE_TARGETS ? <MetaRow scope={scope} initialValue={target} /> : null}
    </div>
  );
}
