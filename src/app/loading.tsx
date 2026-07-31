import { Loader2 } from "lucide-react";

// Root-level loading UI, shown while the app boots before either the (app) shell or the (auth)
// layout has mounted. There is no sidebar to mirror yet, so this is a centered spinner rather
// than a content skeleton.
//
// Deliberately static and bilingual, like global-error.tsx: this fallback also renders on
// DEGRADED paths (an interrupted SSR stream makes React retry the boundary on the client),
// where calling useTranslations threw "NextIntlClientProvider was not found" and crashed the
// recovery. A fixed label cannot fail there, and it reads for both locales.
export default function Loading() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Loader2
        className="size-6 animate-spin text-muted-foreground"
        aria-label="Cargando / Loading"
      />
    </div>
  );
}
