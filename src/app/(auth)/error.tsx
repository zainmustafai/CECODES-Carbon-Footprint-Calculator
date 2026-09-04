"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ErrorScreen } from "@/components/feedback/error-screen";
import { reportError } from "@/lib/observability/report-error";

// Error boundary for the login, register, forgot and reset screens.
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errorPages.boundary");

  useEffect(() => {
    reportError({ where: "auth error boundary", error });
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
