import { LogOut } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { useAuth } from "@/app/providers/auth-provider";
import { CommandPalette, type CommandAction } from "@/components/layout/command-palette";

import type { SideNavItem } from "@/components/layout/side-nav";

export function CommandPaletteContainer({ navItems }: { navItems: SideNavItem[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);

  const actions = useMemo<CommandAction[]>(() => {
    const perform = (fn: () => void | Promise<void>) => {
      setOpen(false);
      void fn();
    };
    const nav: CommandAction[] = navItems.flatMap((item) =>
      (item.children ?? []).map((child) => ({
        icon: item.icon,
        id: `nav.${child.key}`,
        label: item.children && item.children.length > 1 ? `${item.label} / ${child.label}` : child.label,
        onSelect: () => perform(() => void navigate(child.to)),
        section: "navigation" as const,
      })),
    );
    return [
      ...nav,
      {
        icon: LogOut,
        id: "account.signOut",
        label: t("USRSGOUT"),
        onSelect: () =>
          perform(async () => {
            await logout();
            void navigate("/login", { replace: true });
          }),
        section: "account",
      },
    ];
  }, [t, navigate, logout, navItems]);

  return <CommandPalette actions={actions} open={open} onOpenChange={setOpen} />;
}
