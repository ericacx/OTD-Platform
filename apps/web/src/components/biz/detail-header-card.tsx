import { ImageOff } from "lucide-react";

import { cn } from "@/lib/utils";

import { FieldGrid, type FieldItem } from "./field-grid";

import type { ReactNode } from "react";

type DetailHeaderCardProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  tags?: ReactNode;
  fields: FieldItem[];
  image?: ReactNode;
  imageCaption?: string;
  showImage?: boolean;
  actions?: ReactNode;
  className?: string;
};

export function DetailHeaderCard({
  title,
  subtitle,
  tags,
  fields,
  image,
  imageCaption,
  showImage = false,
  actions,
  className,
}: DetailHeaderCardProps) {
  const withImage = showImage || image !== undefined;
  return (
    <section
      className={cn("overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-xs", className)}
    >
      <div className={cn("grid gap-0", withImage && "md:grid-cols-[220px_1fr]")}>
        {withImage ? (
          <div className="flex flex-col items-center justify-center gap-2 border-b border-border bg-muted/40 p-5 md:border-r md:border-b-0">
            <div className="flex aspect-square w-full max-w-[180px] items-center justify-center overflow-hidden rounded-lg bg-card">
              {image ?? <ImageOff aria-hidden="true" className="size-10 text-subtle-foreground" />}
            </div>
            {imageCaption ? <p className="text-xs text-muted-foreground">{imageCaption}</p> : null}
          </div>
        ) : null}
        <div className="min-w-0">
          <div className="border-b border-border bg-gradient-to-r from-primary-soft/70 to-transparent px-5 pt-4 pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                {tags ? <div className="flex flex-wrap items-center gap-1.5">{tags}</div> : null}
                <h2 className="text-xl font-semibold leading-snug">{title}</h2>
                {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
              </div>
              {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
            </div>
          </div>
          <div className="px-5 py-4">
            <FieldGrid items={fields} />
          </div>
        </div>
      </div>
    </section>
  );
}

type SectionCardProps = {
  title: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function SectionCard({ title, extra, children, className, bodyClassName }: SectionCardProps) {
  return (
    <section className={cn("rounded-[var(--radius)] border border-border bg-card shadow-xs", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {extra ? <div className="flex items-center gap-2 text-sm text-muted-foreground">{extra}</div> : null}
      </header>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
