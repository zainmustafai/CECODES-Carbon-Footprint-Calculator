import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

// Root-level loading UI, shown while the app boots before either the (app) shell or the (auth)
// layout has mounted. There is no sidebar to mirror yet, so this is a centered spinner rather
// than a content skeleton. Kept synchronous: a Suspense fallback must not itself suspend, so
// this uses useTranslations (RSC-safe) instead of becoming async for getTranslations.
export default function Loading() {
  const t = useTranslations("common");
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label={t("loading")} />
    </div>
  );
}
