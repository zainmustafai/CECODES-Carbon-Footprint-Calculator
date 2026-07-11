"use client";

import { useEffect } from "react";

// The last resort: this replaces the ROOT layout when it is the root layout that failed.
//
// next-intl is NOT available here. NextIntlClientProvider lives in that root layout, so
// useTranslations would throw and we would render an error boundary that itself errors.
// The copy is therefore static and bilingual, Spanish first. Do not "fix" this by importing
// useTranslations. It also renders its own html and body, because there is no layout above it.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("global error boundary", error.digest, error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          minHeight: "100svh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          padding: "1.5rem",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          background: "#fff",
          color: "#18181b",
        }}
      >
        <main style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Algo salió mal
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#52525b", marginBottom: "0.25rem" }}>
            No pudimos cargar la aplicación. Tus datos están a salvo.
          </p>
          <p style={{ fontSize: "0.875rem", color: "#52525b", marginBottom: "1.5rem" }}>
            We could not load the application. Your data is safe.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              cursor: "pointer",
              borderRadius: "0.5rem",
              border: "none",
              background: "#166534",
              color: "#fff",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            Reintentar / Try again
          </button>
        </main>
      </body>
    </html>
  );
}
