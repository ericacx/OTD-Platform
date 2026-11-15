import { cn } from "@/lib/utils";

import type { ReactNode } from "react";

export type FieldItem = { label: string; value: ReactNode; span?: 1 | 2 | "full"; key?: string };

type FieldGridProps = { items: FieldItem[]; columns?: 2 | 3 | 4; className?: string };

const COLUMNS: Record<2 | 3 | 4, string> = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
};

function isEmpty(value: ReactNode): boolean {
  return value === null || value === undefined || value === "";
}

export function FieldGrid({ items, columns = 4, className }: FieldGridProps) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-4", COLUMNS[columns], className)}>
      {items.map((item, index) => (
        <div
          className={cn("min-w-0", item.span === 2 && "sm:col-span-2", item.span === "full" && "col-span-full")}
          key={item.key ?? `${item.label}-${index}`}
        >
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 break-words text-sm text-foreground">
            {isEmpty(item.value) ? <span className="text-muted-foreground">—</span> : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
