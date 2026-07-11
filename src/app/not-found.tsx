import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Covers every notFound() in the app, including requireAdmin()'s deliberate 404 for a
// company user who guesses an /admin URL. A 404 does not confirm that the admin area exists.
export default async function NotFound() {
  const t = await getTranslations("errorPages.notFound");

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full sm:max-w-md">
        <CardHeader>
          <div className="mb-2 inline-flex size-12 items-center justify-center rounded-full bg-muted">
            <FileQuestion className="size-6 text-muted-foreground" aria-hidden />
          </div>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("body")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/">{t("backHome")}</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
