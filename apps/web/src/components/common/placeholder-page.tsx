import { MENU, pickLabel, type MenuLeaf } from "@otd/shared";
import { Construction } from "lucide-react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "./page-header";

import type { RouteObject } from "react-router";

type PlaceholderPageProps = { leaf: MenuLeaf; moduleCode: string };

export function PlaceholderPage({ leaf, moduleCode }: PlaceholderPageProps) {
  const { t, i18n } = useTranslation();
  return (
    <section className="space-y-5">
      <PageHeader title={pickLabel(leaf.label, i18n.language)} />
      <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-[var(--radius)] border border-dashed border-border bg-card p-10 text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Construction aria-hidden="true" className="size-6" />
        </span>
        <p className="text-base font-medium">{t("PH_TITLE")}</p>
        <p className="text-sm text-muted-foreground">{t("PH_DESC", { module: moduleCode })}</p>
      </div>
    </section>
  );
}

export function leafByPermission(permission: string): { leaf: MenuLeaf; group: (typeof MENU)[number] } {
  for (const group of MENU) {
    const leaf = group.children.find((l) => l.permission === permission);
    if (leaf) return { leaf, group };
  }
  throw new Error(`unknown menu permission ${permission}`);
}

export function leafHandle(permission: string) {
  const { leaf, group } = leafByPermission(permission);
  const breadcrumb = group.children.length > 1 ? [group.label, leaf.label] : [leaf.label];
  return { permissions: [leaf.permission], breadcrumb };
}

export function leafPath(permission: string): string {
  return leafByPermission(permission).leaf.path.replace(/^\//, "");
}

export function placeholderRoutes(moduleKey: string, except: string[] = []): RouteObject[] {
  const group = MENU.find((g) => g.moduleKey === moduleKey);
  if (!group) throw new Error(`unknown module ${moduleKey}`);
  return group.children
    .filter((leaf) => !except.includes(leaf.permission))
    .map((leaf) => ({
      path: leaf.path.replace(/^\//, ""),
      element: <PlaceholderPage leaf={leaf} moduleCode={group.module} />,
      handle: leafHandle(leaf.permission),
    }));
}
