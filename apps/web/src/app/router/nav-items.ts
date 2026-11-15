import { MENU, pickLabel } from "@otd/shared";
import {
  BarChart3,
  Bot,
  Building2,
  CalendarRange,
  CircleDollarSign,
  ClipboardList,
  Database,
  FileText,
  FlaskConical,
  Folder,
  Layers,
  ListChecks,
  Package,
  Radar,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Tag,
  Truck,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import type { SideNavItem } from "@/components/layout/side-nav";

const ICONS: Record<string, LucideIcon> = {
  "list-checks": ListChecks,
  bot: Bot,
  "file-text": FileText,
  layers: Layers,
  tag: Tag,
  send: Send,
  "flask-conical": FlaskConical,
  package: Package,
  "calendar-range": CalendarRange,
  "clipboard-list": ClipboardList,
  "shield-check": ShieldCheck,
  truck: Truck,
  "circle-dollar-sign": CircleDollarSign,
  "shopping-cart": ShoppingCart,
  "building-2": Building2,
  folder: Folder,
  radar: Radar,
  "bar-chart-3": BarChart3,
  "refresh-cw": RefreshCw,
  workflow: Workflow,
  database: Database,
  settings: Settings,
};

export function buildNavItems(permissions: readonly string[], locale: string): SideNavItem[] {
  const granted = new Set(permissions);
  const items: SideNavItem[] = [];
  for (const group of MENU) {
    const children = group.children.filter((leaf) => granted.has(leaf.permission));
    if (children.length === 0) continue;
    const item: SideNavItem = {
      key: group.module,
      icon: ICONS[group.icon] ?? Folder,
      label: pickLabel(group.label, locale),
      code: group.module,
      children: children.map((leaf) => ({ key: leaf.permission, label: pickLabel(leaf.label, locale), to: leaf.path })),
    };
    if (children.length === 1) item.to = children[0]!.path;
    items.push(item);
  }
  return items;
}

export function firstAllowedPath(permissions: readonly string[]): string {
  const granted = new Set(permissions);
  for (const group of MENU) {
    for (const leaf of group.children) if (granted.has(leaf.permission)) return leaf.path;
  }
  return "/403";
}
