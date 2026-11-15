import { pickLabel, type Label } from "@otd/shared";
import { ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useMatches } from "react-router";

import { cn } from "@/lib/utils";

import type { ReactNode } from "react";

export type Crumb = { label: string; to?: string };

type BreadcrumbHandle = { breadcrumb?: Label | Label[] };

type PageHeaderProps = {
  actions?: ReactNode;
  className?: string;
  description?: ReactNode;
  title: string;
  crumbs?: Crumb[];
  extraCrumbs?: Crumb[];
};

export function useRouteCrumbs(): Crumb[] {
  const matches = useMatches();
  const { i18n } = useTranslation();
  return useMemo(() => {
    const out: Crumb[] = [];
    for (const match of matches) {
      const handle = match.handle as BreadcrumbHandle | undefined;
      if (!handle?.breadcrumb) continue;
      const list = Array.isArray(handle.breadcrumb) ? handle.breadcrumb : [handle.breadcrumb];
      list.forEach((label, index) => {
        const crumb: Crumb = { label: pickLabel(label, i18n.language) };
        if (index === list.length - 1) crumb.to = match.pathname;
        out.push(crumb);
      });
    }
    return out;
  }, [matches, i18n.language]);
}

export function PageHeader({ actions, className, description, title, crumbs, extraCrumbs = [] }: PageHeaderProps) {
  const routeCrumbs = useRouteCrumbs();
  const all = [...(crumbs ?? routeCrumbs), ...extraCrumbs];

  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {all.length > 1 ? (
          <nav
            aria-label="breadcrumb"
            className="mb-1.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
          >
            {all.map((crumb, index) => {
              const last = index === all.length - 1;
              return (
                <span className="flex items-center gap-1" key={`${crumb.label}-${index}`}>
                  {index > 0 ? <ChevronRight aria-hidden="true" className="size-3" /> : null}
                  {crumb.to && !last ? (
                    <Link className="hover:text-foreground" to={crumb.to}>
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className={cn(last && "text-foreground/80")}>{crumb.label}</span>
                  )}
                </span>
              );
            })}
          </nav>
        ) : null}
        <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
          <span aria-hidden="true" className="h-5 w-[3px] rounded-full bg-primary" />
          {title}
        </h1>
        {description ? <div className="mt-1.5 max-w-3xl text-sm text-muted-foreground">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
