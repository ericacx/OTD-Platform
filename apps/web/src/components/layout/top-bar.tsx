import { Bell, Menu, PanelLeft, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { LocaleSwitcher } from "./locale-switcher";
import { UserMenu, type ShellUser } from "./user-menu";

import type { AppLocale } from "@/lib/i18n/local-backend";
import type { ReactNode } from "react";

export interface TopBarProps {
  user: ShellUser | null;
  locale: AppLocale;
  unreadCount?: number;
  commandSlot?: ReactNode;
  onToggleSidebar: () => void;
  onOpenMobileNav: () => void;
  onLocaleChange: (locale: AppLocale) => void;
  onSearch: (keyword: string) => void;
  onOpenSettings: () => void;
  onChangePassword: () => void;
  onSignOut: () => void | Promise<void>;
}

export function TopBar({
  user,
  locale,
  unreadCount = 0,
  commandSlot,
  onToggleSidebar,
  onOpenMobileNav,
  onLocaleChange,
  onSearch,
  onOpenSettings,
  onChangePassword,
  onSignOut,
}: TopBarProps) {
  const { t } = useTranslation();
  const [keyword, setKeyword] = useState("");

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur md:px-6">
      <Button
        aria-label={t("NAV_COLLAPSE")}
        className="hidden md:inline-flex"
        size="icon"
        variant="ghost"
        onClick={onToggleSidebar}
      >
        <PanelLeft aria-hidden="true" className="size-4" />
      </Button>
      <Button aria-label={t("NAV_OPEN")} className="md:hidden" size="icon" variant="ghost" onClick={onOpenMobileNav}>
        <Menu aria-hidden="true" className="size-4" />
      </Button>
      <form
        className="relative hidden w-full max-w-sm sm:block"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (keyword.trim()) onSearch(keyword.trim());
        }}
      >
        <Search
          aria-hidden="true"
          className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label={t("TOP_SEARCH")}
          className="h-9 bg-muted pl-8"
          placeholder={t("TOP_SEARCH")}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
      </form>
      <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
        {commandSlot}
        <Button aria-label={t("TOP_NOTIFY")} className="relative" size="icon" variant="ghost">
          <Bell aria-hidden="true" className="size-4" />
          {unreadCount > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Button>
        <LocaleSwitcher locale={locale} onLocaleChange={onLocaleChange} />
        {user ? (
          <UserMenu
            user={user}
            onChangePassword={onChangePassword}
            onOpenSettings={onOpenSettings}
            onSignOut={onSignOut}
          />
        ) : null}
      </div>
    </header>
  );
}
