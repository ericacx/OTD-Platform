import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  action?: ReactNode;
  className?: string;
  description?: string;
  icon?: LucideIcon;
  title: string;
};

export function EmptyState({ action, className, description, icon: Icon = Inbox, title }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-40 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-card p-6 text-center text-card-foreground",
        className,
      )}
      role="status"
    >
      <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
