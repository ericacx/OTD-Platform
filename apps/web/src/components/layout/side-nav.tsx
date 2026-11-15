import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

import type { LucideIcon } from "lucide-react";

export interface SideNavChild {
  key: string;
  label: string;
  to: string;
}

export interface SideNavItem {
  key: string;
  icon: LucideIcon;
  label: string;
  code?: string;
  to?: string;
  children?: SideNavChild[];
}

interface SideNavProps {
  ariaLabel: string;
  items: SideNavItem[];
  collapsed?: boolean;
  onNavigate?: () => void;
}

const itemBase =
  "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

function isActivePath(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function SideNav({ ariaLabel, items, collapsed = false, onNavigate }: SideNavProps) {
  const location = useLocation();
  return (
    <nav aria-label={ariaLabel} className="flex flex-col gap-0.5">
      {items.map((item) =>
        item.children && item.children.length > 1 ? (
          <SideNavGroup
            collapsed={collapsed}
            item={item}
            key={item.key}
            pathname={location.pathname}
            {...(onNavigate ? { onNavigate } : {})}
          />
        ) : (
          <SideNavLink collapsed={collapsed} item={item} key={item.key} {...(onNavigate ? { onNavigate } : {})} />
        ),
      )}
    </nav>
  );
}

function SideNavLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: SideNavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const to = item.to ?? item.children?.[0]?.to ?? "#";
  return (
    <NavLink
      className={({ isActive }) =>
        cn(
          itemBase,
          collapsed && "justify-center px-0",
          isActive &&
            "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
        )
      }
      title={collapsed ? item.label : undefined}
      to={to}
      onClick={onNavigate}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
    </NavLink>
  );
}

function SideNavGroup({
  item,
  pathname,
  collapsed,
  onNavigate,
}: {
  item: SideNavItem;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const children = useMemo(() => item.children ?? [], [item.children]);
  const activeChild = useMemo(() => {
    const matches = children.filter((child) => isActivePath(pathname, child.to));
    return matches.sort((a, b) => b.to.length - a.to.length)[0];
  }, [children, pathname]);
  const [open, setOpen] = useState(Boolean(activeChild));

  if (collapsed) {
    return (
      <NavLink
        className={cn(
          itemBase,
          "justify-center px-0",
          activeChild && "bg-sidebar-primary text-sidebar-primary-foreground",
        )}
        title={item.label}
        to={children[0]?.to ?? "#"}
        onClick={onNavigate}
      >
        <Icon aria-hidden="true" className="size-4" />
        <span className="sr-only">{item.label}</span>
      </NavLink>
    );
  }

  const expanded = open || Boolean(activeChild);
  return (
    <Collapsible open={expanded} onOpenChange={setOpen}>
      <CollapsibleTrigger className={cn(itemBase, activeChild && "text-sidebar-accent-foreground")}>
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left">{item.label}</span>
        {item.code ? <span className="text-[10px] tracking-wide text-sidebar-muted">{item.code}</span> : null}
        <ChevronDown
          aria-hidden="true"
          className={cn("size-4 shrink-0 text-sidebar-muted transition-transform", expanded && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-0.5 flex flex-col gap-0.5 pl-6">
        {children.map((child) => (
          <NavLink
            className={() =>
              cn(
                "flex h-9 items-center rounded-lg px-3 text-[13px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                activeChild?.key === child.key &&
                  "bg-sidebar-primary font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
              )
            }
            end
            key={child.key}
            to={child.to}
            onClick={onNavigate}
          >
            {child.label}
          </NavLink>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
