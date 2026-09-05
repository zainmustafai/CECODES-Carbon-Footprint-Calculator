import { getTranslations } from "next-intl/server";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { LanguageToggle } from "@/features/localization";
import { ThemeToggle } from "@/features/theme";
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
    // sticky, not fixed: the header stays a flex child of SidebarInset, so it keeps the inset's
    // width and needs no left offset when the sidebar collapses. The translucent fill plus
    // backdrop-blur is what makes content read as passing UNDERNEATH it, which is also why the
    // page content below carries no top padding.
    //
    // supports-[backdrop-filter] guards the transparency: a browser with no backdrop-filter would
    // otherwise show the page scrolling through a 70%-opaque header, so those fall back to the
    // solid token instead.
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background px-4 supports-[backdrop-filter]:bg-background/70 supports-[backdrop-filter]:backdrop-blur-md lg:px-6">
      {/* title too: aria-label localizes the accessible name, but the native tooltip comes
          from the vendored component's hardcoded English title unless overridden. */}
      <SidebarTrigger
        className="-ml-1"
        aria-label={t("toggleSidebar")}
        title={t("toggleSidebar")}
      />
      <Separator
        orientation="vertical"
        className="mr-1 data-vertical:h-4 data-vertical:self-auto"
      />
      <div className="min-w-0 flex-1">
        <AppBreadcrumbs />
      </div>
      <ThemeToggle />
      <LanguageToggle />
      <UserMenu email={email} role={role} companyName={companyName} />
    </header>
  );
}
