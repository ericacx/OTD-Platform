import { useTranslation } from "react-i18next";

import { StatusBadge } from "@/components/biz/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/date";

import type { LedgerTaskDto } from "../capacity.types";

type Props = {
  tasks: LedgerTaskDto[];
  canAct: (task: LedgerTaskDto) => boolean;
  onStart: (task: LedgerTaskDto) => void;
  onComplete: (task: LedgerTaskDto) => void;
};

export function TasksTable({ tasks, canAct, onStart, onComplete }: Props) {
  const { t } = useTranslation("capacity");
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted text-muted-foreground">
          <tr className="[&>th]:h-10 [&>th]:px-3 [&>th]:text-left [&>th]:font-medium [&>th]:whitespace-nowrap">
            <th>{t("TASK_LEDGER")}</th>
            <th>{t("TASK_FREQUENCY")}</th>
            <th>{t("TASK_OWNER")}</th>
            <th>{t("TASK_VERSION")}</th>
            <th>{t("TASK_LAST")}</th>
            <th>{t("TASK_NEXT")}</th>
            <th>{t("STATUS")}</th>
            <th>{t("TASK_NOTE")}</th>
            <th>{t("ACTIONS")}</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr className="border-t border-border [&>td]:px-3 [&>td]:py-2" key={task.id}>
              <td className="font-medium">{task.name}</td>
              <td>{t(`FREQ_${task.frequency}`)}</td>
              <td>{task.ownerName ?? "—"}</td>
              <td className="tabular">{task.currentVersion ?? "—"}</td>
              <td className="tabular text-muted-foreground">{formatDate(task.lastUpdatedAt, true)}</td>
              <td className="tabular">{formatDate(task.nextDueAt)}</td>
              <td>
                <StatusBadge code={task.status} machine="ledgerTask" />
              </td>
              <td className="max-w-80 text-xs">
                {task.status === "OVERDUE" ? (
                  <span className="text-danger">{task.note ?? t("TASK_OVERDUE_DAYS", { days: task.overdueDays })}</span>
                ) : (
                  (task.note ?? "—")
                )}
              </td>
              <td className="whitespace-nowrap">
                {canAct(task) && (task.status === "PENDING" || task.status === "OVERDUE") ? (
                  <Button className="h-auto px-1" variant="link" onClick={() => onStart(task)}>
                    {t("TASK_START")}
                  </Button>
                ) : null}
                {canAct(task) && task.status !== "DONE" ? (
                  <Button className="h-auto px-1" variant="link" onClick={() => onComplete(task)}>
                    {t("TASK_COMPLETE")}
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
