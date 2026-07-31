"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buildCredentialsFile, downloadTextFile } from "../lib/credentials-file";

// The one place freshly generated credentials are shown: after creating a user (dialog and
// company wizard) and after regenerating a password. The password exists in plaintext only
// here, so copy and the .txt download both live on this box and nowhere else.
export function CredentialsBox({ email, password }: { email: string; password: string }) {
  const t = useTranslations("admin.credentials");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${email}\n${password}`);
      setCopied(true);
      toast.success(t("copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  function download() {
    const { filename, content } = buildCredentialsFile({
      origin: window.location.origin,
      email,
      password,
      labels: {
        title: t("file.title"),
        subtitle: t("file.subtitle"),
        url: t("file.url"),
        email: t("file.email"),
        password: t("file.password"),
        note: t("file.note"),
      },
    });
    downloadTextFile(filename, content);
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
      <p className="text-sm font-medium">{t("title")}</p>
      <dl className="grid gap-1 text-sm">
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 text-muted-foreground">{t("email")}</dt>
          <dd className="font-mono break-all">{email}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 text-muted-foreground">{t("password")}</dt>
          <dd className="font-mono break-all">{password}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <p className="text-xs text-muted-foreground">{t("help")}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={copy}>
            {copied ? (
              <Check className="size-4" aria-hidden />
            ) : (
              <Copy className="size-4" aria-hidden />
            )}
            {copied ? t("copiedShort") : t("copy")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={download}>
            <Download className="size-4" aria-hidden />
            {t("download")}
          </Button>
        </div>
      </div>
    </div>
  );
}
