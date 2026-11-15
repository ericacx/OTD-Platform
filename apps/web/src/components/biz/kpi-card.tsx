import { Link } from "react-router";

import { cn } from "@/lib/utils";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "default" | "primary" | "success" | "warning" | "danger" | "info";

const VALUE_TONE: Record<Tone, string> = {
  default: "text-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
};

const ICON_TONE: Record<Tone, string> = {
  default: "bg-muted text-muted-foreground",
  primary: "bg-primary-soft text-primary",
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  danger: "bg-danger/12 text-danger",
  info: "bg-info/12 text-info",
};

export type KpiCardProps = {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  progress?: number;
  to?: string;
  className?: string;
};

export function KpiCard({
  label,
  value,
  unit,
  hint,
  icon: Icon,
  tone = "default",
  progress,
  to,
  className,
}: KpiCardProps) {
  const body = (
    <div
      className={cn(
        "relative flex h-full flex-col gap-1 rounded-[var(--radius)] border border-border bg-card p-4 shadow-xs",
        to && "transition-colors hover:border-primary/40",
        className,
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("tabular flex items-baseline gap-1 text-[28px] font-semibold leading-tight", VALUE_TONE[tone])}>
        <span>{value}</span>
        {unit ? <span className="text-sm font-normal text-muted-foreground">{unit}</span> : null}
      </p>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      {typeof progress === "number" ? (
        <div aria-hidden="true" className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>
      ) : null}
      {Icon ? (
        <span
          className={cn(
            "absolute right-4 bottom-4 inline-flex size-8 items-center justify-center rounded-lg",
            ICON_TONE[tone],
          )}
        >
          <Icon aria-hidden="true" className="size-4" />
        </span>
      ) : null}
    </div>
  );
  return to ? (
    <Link className="block focus-visible:outline-2" to={to}>
      {body}
    </Link>
  ) : (
    body
  );
}
