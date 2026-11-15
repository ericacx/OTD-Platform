import { useTranslation } from "react-i18next";

import { dueState } from "@/lib/date";
import { cn } from "@/lib/utils";

type DueLabelProps = { due: string | Date | null | undefined; now?: Date; className?: string };

export function DueLabel({ due, now, className }: DueLabelProps) {
  const { t } = useTranslation();
  if (!due) return <span className="text-muted-foreground">—</span>;
  const state = dueState(due, now ?? new Date());
  const text =
    state.kind === "overdue"
      ? t("DUE_OVERDUE", { days: state.days })
      : state.kind === "today"
        ? t("DUE_TODAY", { time: state.time })
        : state.kind === "tomorrow"
          ? t("DUE_TOMORROW")
          : t("DUE_LEFT", { days: state.days });
  const tone =
    state.kind === "overdue" ? "text-danger" : state.kind === "today" ? "text-warning" : "text-muted-foreground";
  return <span className={cn("tabular text-sm font-medium whitespace-nowrap", tone, className)}>{text}</span>;
}
