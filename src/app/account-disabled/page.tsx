import { getTranslations } from "next-intl/server";
import { ShieldOff } from "lucide-react";
import { requireUser } from "@/lib/auth/server";
import { SignOutButton } from "@/features/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Where requireAppUser() sends a deactivated user.
//
// It lives outside both route groups on purpose. The (app) shell would render a sidebar of
// links this user cannot open, and the (auth) layout redirects anyone with a session
// straight to /dashboard.
//
// It calls requireUser(), never requireAppUser(): the latter is what redirects here, so
// using it would loop forever.
export default async function AccountDisabledPage() {
  await requireUser();
  const t = await getTranslations("accountDisabled");

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full sm:max-w-md">
        <CardHeader>
          <div className="mb-2 inline-flex size-12 items-center justify-center rounded-full bg-muted">
            <ShieldOff className="size-6 text-muted-foreground" aria-hidden />
          </div>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("body")}</CardDescription>
        </CardHeader>
        <CardContent>
          <SignOutButton />
        </CardContent>
      </Card>
    </main>
  );
}
