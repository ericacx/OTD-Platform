import { pickLabel, statusLabel } from "@otd/shared";
import { useTranslation } from "react-i18next";

import { ProgressTimeline, type TimelineStep } from "@/components/biz/progress-timeline";
import { formatDate } from "@/lib/date";

import type { OrderDetail, OrderStageDto } from "../order.types";

const STATE: Record<OrderStageDto["state"], TimelineStep["state"]> = {
  DONE: "done",
  CURRENT: "current",
  PENDING: "pending",
};

export function OrderStageTimeline({ order }: { order: OrderDetail }) {
  const { t, i18n } = useTranslation("order");
  const steps = order.stages.map((stage): TimelineStep => {
    const step: TimelineStep = {
      key: stage.status,
      title: pickLabel(statusLabel("order", stage.status), i18n.language),
      state: order.status === "CANCELLED" && stage.state !== "DONE" ? "na" : STATE[stage.state],
    };
    if (stage.state === "PENDING" && order.status !== "CANCELLED") step.description = t("STAGE_NOT_STARTED");
    if (stage.status !== "COMPLETED" && (stage.elapsedDays !== null || stage.avgDays !== null)) {
      step.duration = {
        spentHours: stage.elapsedDays === null ? null : stage.elapsedDays * 24,
        avgHours: stage.avgDays === null ? null : stage.avgDays * 24,
      };
    }
    if (stage.logs.length) {
      step.children = (
        <ul className="space-y-1 text-sm">
          {stage.logs.map((log) => (
            <li className="grid gap-x-3 sm:grid-cols-[124px_1fr_auto]" key={log.id}>
              <span className="tabular text-xs text-muted-foreground">{formatDate(log.at, true)}</span>
              <span>{log.action}</span>
              <span className="text-xs text-muted-foreground">{log.operatorName ?? ""}</span>
            </li>
          ))}
        </ul>
      );
    }
    return step;
  });
  return <ProgressTimeline steps={steps} />;
}
