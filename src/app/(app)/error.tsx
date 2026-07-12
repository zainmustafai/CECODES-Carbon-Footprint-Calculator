"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ErrorScreen } from "@/components/feedback/error-screen";

// Error boundary for every authenticated screen. A failed Prisma query used to fall through
// to Next's default error page, which is unstyled, English, and says nothing useful.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errorPages.boundary");

  useEffect(() => {
    // The digest is the only handle on the server-side stack, which is never sent to the browser.
    console.error("app error boundary", error.digest, error);
  }, [error]);

  return (
    <ErrorScreen
      title={t("title")}
      body={t("body")}
      retryLabel={t("retry")}
      onRetry={reset}
    />
  );
}
