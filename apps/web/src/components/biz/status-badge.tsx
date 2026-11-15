import { pickLabel, statusLabel, statusTone, type MachineKey, type Tone } from "@otd/shared";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

export const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-success/12 text-success ring-success/25",
  warning: "bg-warning/12 text-warning ring-warning/25",
  danger: "bg-danger/12 text-danger ring-danger/25",
  info: "bg-info/12 text-info ring-info/25",
  neutral: "bg-muted text-muted-foreground ring-border",
};

type ToneBadgeProps = { label: string; tone?: Tone; className?: string | undefined };

export function ToneBadge({ label, tone = "neutral", className }: ToneBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center whitespace-nowrap rounded-md px-2 text-xs font-medium ring-1 ring-inset",
        TONE_CLASSES[tone],
        className,
      )}
      data-tone={tone}
    >
      {label}
    </span>
  );
}

type StatusBadgeProps = { machine: MachineKey; code: string | null | undefined; className?: string | undefined };

export function StatusBadge({ machine, code, className }: StatusBadgeProps) {
  const { i18n } = useTranslation();
  if (!code) return <span className="text-muted-foreground">—</span>;
  return (
    <ToneBadge
      className={className}
      label={pickLabel(statusLabel(machine, code), i18n.language)}
      tone={statusTone(machine, code)}
    />
  );
}

type TagProps = { children: string; className?: string };

export function PrimaryTag({ children, className }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-md bg-primary-soft px-2 text-xs font-medium text-primary",
        className,
      )}
    >
      {children}
    </span>
  );
}
