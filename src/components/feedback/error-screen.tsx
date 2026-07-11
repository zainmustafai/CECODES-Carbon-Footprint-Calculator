"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// The body of every route error boundary. Kept dumb and translated by the caller, because
// app/global-error.tsx cannot use next-intl (it replaces the root layout, and with it the
// NextIntlClientProvider).
export function ErrorScreen({
  title,
  body,
  retryLabel,
  onRetry,
}: {
  title: string;
  body: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-[60svh] items-center justify-center p-6">
      <Card className="w-full sm:max-w-md">
        <CardHeader>
          <div className="mb-2 inline-flex size-12 items-center justify-center rounded-full bg-muted">
            <AlertTriangle className="size-6 text-muted-foreground" aria-hidden />
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{body}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onRetry}>{retryLabel}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
