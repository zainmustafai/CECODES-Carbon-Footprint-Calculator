"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { ClipboardList, FileBarChart, Gauge, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "cecodes.introGuide.dismissed";

const STEPS = [
  { key: "step1", icon: ClipboardList },
  { key: "step2", icon: Gauge },
  { key: "step3", icon: FileBarChart },
] as const;

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function getSnapshot() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false; // storage unavailable (private mode, etc.) - show the card rather than hide it
  }
}

function getServerSnapshot() {
  return true; // unknown until the client mounts - render nothing rather than flash the card
}

// A short, illustrated "how this tool works" card, shown first on the dashboard - client
// feedback 2026-08-24: "Include an Introduction section in the first place... shorter than
// already existing one" (the existing guide is docs/USER_GUIDE.md, a full external document;
// this is the 3-step in-app version). Dismissal is remembered in localStorage: this is a
// per-browser convenience, not tenant data, so it does not need a server round trip or a
// database column. useSyncExternalStore (rather than useState+useEffect) reads that external
// store without the render-then-setState waterfall the effect version would need.
export function IntroGuide() {
  const t = useTranslations("dashboard.intro");
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (dismissed) return null;

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
      // useSyncExternalStore only re-renders on a "storage" event, which the same tab that wrote
      // the value never receives - fire one manually so this tab hides the card immediately too.
      window.dispatchEvent(new StorageEvent("storage"));
    } catch {
      // Storage unavailable - the card just reappears next visit, which is a fine fallback.
    }
  }

  return (
    <Card className="border-primary/20 bg-primary/3">
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="font-semibold text-base">{t("title")}</h2>
            <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={dismiss}
            aria-label={t("dismiss")}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map(({ key, icon: Icon }, i) => (
            <div key={key} className="flex gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-4" aria-hidden />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-medium">
                  {i + 1}. {t(`${key}Title`)}
                </p>
                <p className="text-xs text-muted-foreground">{t(`${key}Body`)}</p>
              </div>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={dismiss}>
          {t("gotIt")}
        </Button>
      </CardContent>
    </Card>
  );
}
