import { getTranslations } from "next-intl/server";
import { Building2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Rendered by the company-user pages when their company has been deactivated by an admin.
// The user themselves is still active, so /account-disabled would be the wrong message and
// signing them out would be the wrong action: an admin can reactivate the company.
export async function CompanyInactiveScreen() {
  const t = await getTranslations("companyInactive");

  return (
    <Card className="border-dashed">
      <CardHeader>
        <div className="mb-2 inline-flex size-12 items-center justify-center rounded-full bg-muted">
          <Building2 className="size-6 text-muted-foreground" aria-hidden />
        </div>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("body")}</CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  );
}
