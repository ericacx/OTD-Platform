import { pickLabel, statusLabel } from "@otd/shared";
import { AlertTriangle, CheckCircle2, ListChecks, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { RequirePermission } from "@/app/router/guards";
import { DocNoLink } from "@/components/biz/doc-no-link";
import { KpiCard } from "@/components/biz/kpi-card";
import { StatusBadge, ToneBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { TaskFormDialog } from "@/features/sync/components/task-form-dialog";
import { SYNC_DIRECTIONS, SYNC_OBJECTS, SYNC_TRIGGERS, useSyncLabels } from "@/features/sync/sync.labels";
import { useSyncTasksQuery } from "@/features/sync/sync.queries";
import { formatDate } from "@/lib/date";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { SyncTaskDto } from "@/features/sync/sync.types";
import type { ColumnDef } from "@tanstack/react-table";

const FILTER = "h-9 rounded-md border border-input bg-card px-2 text-sm";
const RESULTS = ["SUCCESS", "PARTIAL", "FAILED"] as const;

export function TasksPage() {
  const { t, i18n } = useTranslation("sync");
  const labels = useSyncLabels();
  const navigate = useNavigate();
  const query = useTableQueryState();
  const tasks = useSyncTasksQuery(query.params);
  const overview = useSyncTasksQuery({ pageSize: 200 });
  const [creating, setCreating] = useState(false);

  const kpi = useMemo(() => {
    const items = overview.data?.items ?? [];
    return {
      total: overview.data?.total ?? 0,
      enabled: items.filter((x) => x.enabled).length,
      attention: items.filter((x) => x.lastStatus === "PARTIAL" || x.lastStatus === "FAILED").length,
      failures: items.reduce((sum, x) => sum + x.openFailures, 0),
    };
  }, [overview.data]);

  const columns = useMemo<ColumnDef<SyncTaskDto, unknown>[]>(
    () => [
      {
        accessorKey: "docNo",
        header: t("TASK_NO"),
        cell: ({ row }) => <DocNoLink no={row.original.docNo} to={`/sync/tasks/${row.original.id}`} />,
      },
      {
        accessorKey: "name",
        header: t("TASK_NAME"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="max-w-80 truncate font-medium">{row.original.name}</p>
            <p className="text-xs text-muted-foreground">{labels.object(row.original.object)}</p>
          </div>
        ),
      },
      { accessorKey: "customerCode", header: t("CUSTOMER"), cell: ({ row }) => row.original.customerCode ?? "—" },
      {
        id: "link",
        header: t("SOURCE_TARGET"),
        cell: ({ row }) => {
          const s = labels.systems(row.original.direction, row.original.endpointName);
          return (
            <span className="whitespace-nowrap">
              {s.source} → {s.target}
            </span>
          );
        },
      },
      {
        accessorKey: "direction",
        header: t("DIRECTION"),
        cell: ({ row }) => <ToneBadge label={labels.direction(row.original.direction)} tone="info" />,
      },
      { accessorKey: "mode", header: t("MODE"), cell: ({ row }) => labels.mode(row.original.mode) },
      {
        id: "frequency",
        header: t("FREQUENCY"),
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {row.original.trigger === "SCHEDULED"
              ? (row.original.frequency ?? labels.trigger(row.original.trigger))
              : labels.trigger(row.original.trigger)}
          </span>
        ),
      },
      {
        accessorKey: "lastStatus",
        header: t("LAST_RESULT"),
        cell: ({ row }) =>
          row.original.lastStatus ? (
            <StatusBadge code={row.original.lastStatus} machine="syncRun" />
          ) : (
            <span className="text-muted-foreground">{t("NOT_RUN")}</span>
          ),
      },
      {
        accessorKey: "openFailures",
        header: t("OPEN_FAILURES"),
        meta: { align: "right" },
        cell: ({ row }) => (
          <span className={row.original.openFailures ? "tabular font-semibold text-danger" : "tabular"}>
            {row.original.openFailures}
          </span>
        ),
      },
      {
        accessorKey: "nextRunAt",
        header: t("NEXT_RUN"),
        cell: ({ row }) =>
          row.original.enabled ? (
            <span className="tabular whitespace-nowrap">{formatDate(row.original.nextRunAt, true)}</span>
          ) : (
            <ToneBadge label={t("DISABLED_TAG")} tone="neutral" />
          ),
      },
    ],
    [t, labels],
  );

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code="sync.task.edit">
            <Button onClick={() => setCreating(true)}>{t("TASK_NEW")}</Button>
          </RequirePermission>
        }
        title={t("TASKS_TITLE")}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={ListChecks} label={t("KPI_TASKS")} tone="primary" unit={t("UNIT_TASKS")} value={kpi.total} />
        <KpiCard
          icon={CheckCircle2}
          label={t("KPI_ENABLED")}
          tone="success"
          unit={t("UNIT_TASKS")}
          value={kpi.enabled}
        />
        <KpiCard
          icon={AlertTriangle}
          label={t("KPI_ATTENTION")}
          tone={kpi.attention ? "warning" : "default"}
          unit={t("UNIT_TASKS")}
          value={kpi.attention}
        />
        <KpiCard
          icon={RotateCcw}
          label={t("KPI_OPEN_FAILURES")}
          to="/sync/retry"
          tone={kpi.failures ? "danger" : "default"}
          unit={t("UNIT_RECORDS")}
          value={kpi.failures}
        />
      </div>
      <ServerDataTable
        columns={columns}
        error={tasks.error}
        getRowId={(row) => row.id}
        isLoading={tasks.isLoading}
        page={tasks.data}
        query={query}
        searchPlaceholder={t("TASK_SEARCH")}
        toolbar={
          <>
            <select
              aria-label={t("OBJECT")}
              className={FILTER}
              value={query.filters.object ?? ""}
              onChange={(event) => query.setFilter("object", event.target.value || undefined)}
            >
              <option value="">{t("ALL_OBJECTS")}</option>
              {SYNC_OBJECTS.map((o) => (
                <option key={o} value={o}>
                  {labels.object(o)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("DIRECTION")}
              className={FILTER}
              value={query.filters.direction ?? ""}
              onChange={(event) => query.setFilter("direction", event.target.value || undefined)}
            >
              <option value="">{t("ALL_DIRECTIONS")}</option>
              {SYNC_DIRECTIONS.map((d) => (
                <option key={d} value={d}>
                  {labels.direction(d)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("TRIGGER")}
              className={FILTER}
              value={query.filters.trigger ?? ""}
              onChange={(event) => query.setFilter("trigger", event.target.value || undefined)}
            >
              <option value="">{t("ALL_TRIGGERS")}</option>
              {SYNC_TRIGGERS.map((x) => (
                <option key={x} value={x}>
                  {labels.trigger(x)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("LAST_RESULT")}
              className={FILTER}
              value={query.filters.lastStatus ?? ""}
              onChange={(event) => query.setFilter("lastStatus", event.target.value || undefined)}
            >
              <option value="">{t("ALL_RESULTS")}</option>
              {RESULTS.map((s) => (
                <option key={s} value={s}>
                  {pickLabel(statusLabel("syncRun", s), i18n.language)}
                </option>
              ))}
            </select>
          </>
        }
        onRowClick={(row) => void navigate(`/sync/tasks/${row.id}`)}
      />
      <TaskFormDialog
        open={creating}
        task={null}
        onOpenChange={setCreating}
        onSaved={(task) => void navigate(`/sync/tasks/${task.id}`)}
      />
    </section>
  );
}
