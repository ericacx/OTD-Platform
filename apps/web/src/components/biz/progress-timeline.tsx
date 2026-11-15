import { ArrowRight, Check, Diamond } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { formatDuration } from "@/lib/date";
import { cn } from "@/lib/utils";

import type { ReactNode } from "react";

export type TimelineState = "done" | "current" | "pending" | "blocked" | "na";

export type TimelineStep = {
  key: string;
  title: string;
  state: TimelineState;
  gate?: boolean;
  description?: ReactNode;
  meta?: ReactNode;
  link?: { to: string; label?: string };
  duration?: { spentHours?: number | null; avgHours?: number | null };
  children?: ReactNode;
};

const DOT: Record<TimelineState, string> = {
  done: "bg-primary text-primary-foreground border-primary",
  current: "bg-card text-primary border-primary ring-4 ring-primary-soft",
  pending: "bg-card text-muted-foreground border-border",
  blocked: "bg-danger text-white border-danger",
  na: "bg-muted text-subtle-foreground border-dashed border-border",
};

const CARD: Record<TimelineState, string> = {
  done: "border-border bg-card",
  current: "border-primary/40 bg-primary-soft/60",
  pending: "border-border bg-card",
  blocked: "border-danger/50 bg-danger/5",
  na: "border-dashed border-border bg-muted/40",
};

const STATE_KEY = {
  done: "TL_DONE",
  current: "TL_CURRENT",
  pending: "TL_PENDING",
  blocked: "TL_BLOCKED",
  na: "TL_NA",
} as const;

const STATE_TONE: Record<TimelineState, string> = {
  done: "bg-success/12 text-success",
  current: "bg-warning/12 text-warning",
  pending: "bg-muted text-muted-foreground",
  blocked: "bg-danger/12 text-danger",
  na: "bg-muted text-subtle-foreground",
};

function Duration({ hours }: { hours: number }) {
  const { t } = useTranslation();
  const d = formatDuration(hours);
  return (
    <span className="tabular font-medium text-foreground">
      {t(d.unit === "hour" ? "DUR_HOURS" : "DUR_DAYS", { value: d.value })}
    </span>
  );
}

type ProgressTimelineProps = { steps: TimelineStep[]; className?: string };

export function ProgressTimeline({ steps, className }: ProgressTimelineProps) {
  const { t } = useTranslation();
  return (
    <ol className={cn("relative space-y-3", className)}>
      {steps.map((step, index) => {
        const slow =
          step.duration?.spentHours != null &&
          step.duration.avgHours != null &&
          step.duration.spentHours > step.duration.avgHours;
        return (
          <li className="relative flex gap-4" data-state={step.state} key={step.key}>
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold",
                  DOT[step.state],
                )}
              >
                {step.state === "done" ? <Check aria-hidden="true" className="size-3.5" /> : index + 1}
              </span>
              {index < steps.length - 1 ? (
                <span aria-hidden="true" className="w-px flex-1 border-l-2 border-dashed border-primary/30" />
              ) : null}
            </div>
            <div className={cn("mb-1 min-w-0 flex-1 rounded-lg border px-4 py-3", CARD[step.state])}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("font-semibold", step.state === "na" && "text-muted-foreground line-through")}>
                  {step.title}
                </span>
                {step.gate ? (
                  <Diamond aria-label={t("TL_GATE")} className="size-3.5 fill-primary text-primary" />
                ) : null}
                <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", STATE_TONE[step.state])}>
                  {t(STATE_KEY[step.state])}
                </span>
              </div>
              {step.description ? <div className="mt-1 text-sm text-muted-foreground">{step.description}</div> : null}
              {step.children ? <div className="mt-2">{step.children}</div> : null}
              {step.duration && (step.duration.spentHours != null || step.duration.avgHours != null) ? (
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {step.duration.spentHours != null ? (
                    <span>
                      {t("TL_SPENT")} <Duration hours={step.duration.spentHours} />
                    </span>
                  ) : null}
                  {step.duration.avgHours != null ? (
                    <span>
                      {t("TL_AVG")} <Duration hours={step.duration.avgHours} />
                    </span>
                  ) : null}
                  {slow ? (
                    <span className="rounded bg-danger/12 px-1.5 py-0.5 font-medium text-danger">{t("TL_SLOW")}</span>
                  ) : null}
                </div>
              ) : null}
              {step.meta ? <div className="mt-2 text-xs text-muted-foreground">{step.meta}</div> : null}
              {step.link ? (
                <Link
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  to={step.link.to}
                >
                  {step.link.label ?? t("TL_GO")}
                  <ArrowRight aria-hidden="true" className="size-3.5" />
                </Link>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
