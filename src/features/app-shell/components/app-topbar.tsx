import { getTranslations } from "next-intl/server";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { LanguageToggle } from "@/features/localization";
import { AppBreadcrumbs } from "./app-breadcrumbs";
import { UserMenu } from "./user-menu";

type AppTopbarProps = {
  email?: string;
  role: string;
  companyName?: string | null;
};

export async function AppTopbar({ email, role, companyName }: AppTopbarProps) {
  const t = await getTranslations("nav");

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 lg:px-6">
      <SidebarTrigger className="-ml-1" aria-label={t("toggleSidebar")} />
      <Separator
        orientation="vertical"
        className="mr-1 data-vertical:h-4 data-vertical:self-auto"
      />
      <div className="min-w-0 flex-1">
        <AppBreadcrumbs />
      </div>
      <LanguageToggle />
      <UserMenu email={email} role={role} companyName={companyName} />
    </header>
  );
}
