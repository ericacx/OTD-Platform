import { useTranslation } from "react-i18next";

import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { useLedgerTasksQuery } from "@/features/capacity/capacity.queries";
import { TasksTable } from "@/features/capacity/components/tasks-table";

import { useTaskActions } from "./use-task-actions";

export function LedgerTasksPage() {
  const { t } = useTranslation("capacity");
  const tasks = useLedgerTasksQuery();
  const actions = useTaskActions();
  return (
    <section className="space-y-5">
      <PageHeader description={t("TASKS_DESC")} title={t("TASKS_TITLE")} />
      <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-xs">
        {tasks.isLoading ? (
          <LoadingState />
        ) : tasks.error ? (
          <ErrorState error={tasks.error} />
        ) : (
          <TasksTable
            canAct={actions.canAct}
            tasks={tasks.data ?? []}
            onComplete={actions.onComplete}
            onStart={actions.onStart}
          />
        )}
      </div>
      {actions.dialog}
    </section>
  );
}
