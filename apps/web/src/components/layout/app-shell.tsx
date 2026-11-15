import { useTranslation } from "react-i18next";
import { Outlet } from "react-router";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { SideNav, type SideNavItem } from "./side-nav";
import { TopBar, type TopBarProps } from "./top-bar";

import type { ReactNode } from "react";

interface AppShellProps extends Omit<TopBarProps, "onOpenMobileNav"> {
  navItems: SideNavItem[];
  collapsed: boolean;
  mobileNavOpen: boolean;
  onMobileNavChange: (open: boolean) => void;
  overlay?: ReactNode;
}

function Brand({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4",
        collapsed && "justify-center px-0",
      )}
    >
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-[11px] font-bold text-sidebar-primary-foreground">
        OTD
      </span>
      {collapsed ? null : (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold text-sidebar-accent-foreground">{t("BRAND_NAME")}</span>
          <span className="block truncate text-[10px] tracking-[0.18em] text-sidebar-muted">{t("BRAND_TAGLINE")}</span>
        </span>
      )}
    </div>
  );
}

export function AppShell({ navItems, collapsed, mobileNavOpen, onMobileNavChange, overlay, ...topBar }: AppShellProps) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside
        className={cn(
          "bg-sidebar-gradient sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border transition-[width] duration-200 md:flex",
          collapsed ? "w-16" : "w-[220px]",
        )}
      >
        <Brand collapsed={collapsed} />
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <SideNav ariaLabel={t("NAV_MAIN")} collapsed={collapsed} items={navItems} />
        </div>
      </aside>
      <Sheet open={mobileNavOpen} onOpenChange={onMobileNavChange}>
        <SheetContent className="bg-sidebar-gradient w-[260px] border-sidebar-border p-0" side="left">
          <SheetTitle className="sr-only">{t("NAV_MAIN")}</SheetTitle>
          <Brand collapsed={false} />
          <div className="overflow-y-auto px-2 py-3">
            <SideNav ariaLabel={t("NAV_MAIN")} items={navItems} onNavigate={() => onMobileNavChange(false)} />
          </div>
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar {...topBar} onOpenMobileNav={() => onMobileNavChange(true)} />
        <main className="min-w-0 flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
      {overlay}
    </div>
  );
}
