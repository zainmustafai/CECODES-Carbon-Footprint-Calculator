"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ErrorScreen } from "@/components/feedback/error-screen";

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
    console.error("auth error boundary", error.digest, error);
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
