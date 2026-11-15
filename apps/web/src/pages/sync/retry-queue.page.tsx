import { SYNC_ERROR_TYPES } from "@otd/contracts/sync";
import { Archive, Clock, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { RequirePermission } from "@/app/router/guards";
import { DocNoLink } from "@/components/biz/doc-no-link";
import { KpiCard } from "@/components/biz/kpi-card";
import { ToneBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { QUEUE_TONE, SYNC_QUEUE_STATES, useSyncLabels } from "@/features/sync/sync.labels";
import { useRetryRecordsMutation } from "@/features/sync/sync.mutations";
import { useRetryQueueQuery } from "@/features/sync/sync.queries";
import { formatDate } from "@/lib/date";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { SyncRecordDto } from "@/features/sync/sync.types";
import type { SyncErrorType } from "@otd/contracts/sync";
import type { ColumnDef } from "@tanstack/react-table";

const FILTER = "h-9 rounded-md border border-input bg-card px-2 text-sm";
const ERROR_TYPES = Object.keys(SYNC_ERROR_TYPES) as SyncErrorType[];

export function RetryQueuePage() {
  const { t } = useTranslation("sync");
  const { t: tc } = useTranslation();
  const labels = useSyncLabels();
  const query = useTableQueryState();
  const records = useRetryQueueQuery(query.params);
  const pending = useRetryQueueQuery({ state: "PENDING", pageSize: 1 });
  const manual = useRetryQueueQuery({ state: "MANUAL", pageSize: 1 });
  const abandoned = useRetryQueueQuery({ state: "ABANDONED", pageSize: 1 });
  const retry = useRetryRecordsMutation();
  const [selected, setSelected] = useState<string[]>([]);
  const pageIds = useMemo(() => (records.data?.items ?? []).map((r) => r.id), [records.data]);
  const allChecked = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));

  const columns = useMemo<ColumnDef<SyncRecordDto, unknown>[]>(
    () => [
      {
        id: "select",
        header: () => (
          <input
            aria-label={t("SELECT_ALL_ROWS")}
            checked={allChecked}
            type="checkbox"
            onChange={(e) =>
              setSelected((prev) =>
                e.target.checked ? [...new Set([...prev, ...pageIds])] : prev.filter((id) => !pageIds.includes(id)),
              )
            }
          />
        ),
        cell: ({ row }) => (
          <input
            aria-label={t("SELECT_ROW", { key: row.original.recordKey })}
            checked={selected.includes(row.original.id)}
            type="checkbox"
            onChange={(e) =>
              setSelected((prev) =>
                e.target.checked ? [...prev, row.original.id] : prev.filter((id) => id !== row.original.id),
              )
            }
          />
        ),
      },
      {
        accessorKey: "recordKey",
        header: t("RECORD_KEY"),
        cell: ({ row }) => <span className="font-medium whitespace-nowrap">{row.original.recordKey}</span>,
      },
      {
        id: "task",
        header: t("TASK"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <DocNoLink no={row.original.taskDocNo} to={`/sync/tasks/${row.original.taskId}`} />
            <p className="max-w-64 truncate text-xs text-muted-foreground">{row.original.taskName}</p>
          </div>
        ),
      },
      {
        accessorKey: "errorType",
        header: t("ERROR_TYPE"),
        cell: ({ row }) => <ToneBadge label={labels.errorType(row.original.errorType)} tone="danger" />,
      },
      {
        accessorKey: "errorMessage",
        header: t("REASON"),
        cell: ({ row }) => (
          <div className="max-w-80 min-w-0">
            <p>{row.original.errorMessage ?? "—"}</p>
            {row.original.suggestion ? (
              <p className="text-xs text-muted-foreground">{row.original.suggestion}</p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "queueState",
        header: t("QUEUE_STATE"),
        cell: ({ row }) =>
          row.original.queueState ? (
            <ToneBadge label={labels.queueState(row.original.queueState)} tone={QUEUE_TONE[row.original.queueState]} />
          ) : null,
      },
      {
        accessorKey: "attempts",
        header: t("ATTEMPTS"),
        meta: { align: "right" },
        cell: ({ row }) => <span className="tabular">{row.original.attempts}</span>,
      },
      {
        accessorKey: "nextRetryAt",
        header: t("NEXT_RETRY"),
        cell: ({ row }) => (
          <span className="tabular whitespace-nowrap">
            {row.original.nextRetryAt ? formatDate(row.original.nextRetryAt, true) : "—"}
          </span>
        ),
      },
    ],
    [t, labels, selected, pageIds, allChecked],
  );

  return (
    <section className="space-y-5">
      <PageHeader description={t("RETRY_NOTE")} title={t("RETRY_TITLE")} />
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          icon={Clock}
          label={t("STATE_PENDING")}
          tone="warning"
          unit={t("UNIT_RECORDS")}
          value={pending.data?.total ?? 0}
        />
        <KpiCard
          icon={Wrench}
          label={t("STATE_MANUAL")}
          tone="danger"
          unit={t("UNIT_RECORDS")}
          value={manual.data?.total ?? 0}
        />
        <KpiCard
          icon={Archive}
          label={t("STATE_ABANDONED")}
          tone="default"
          unit={t("UNIT_RECORDS")}
          value={abandoned.data?.total ?? 0}
        />
      </div>
      <ServerDataTable
        actions={
          <RequirePermission code="sync.retry.run">
            <Button
              disabled={!selected.length || retry.isPending}
              size="sm"
              onClick={() =>
                void retry
                  .mutateAsync(selected)
                  .then((res) => {
                    setSelected([]);
                    toast.success(t("RETRY_DONE", { total: res.total, success: res.success, failed: res.failed }));
                  })
                  .catch((err: unknown) => toast.error(err instanceof Error ? err.message : tc("BIZERR")))
              }
            >
              {t("RETRY_SELECTED", { count: selected.length })}
            </Button>
          </RequirePermission>
        }
        columns={columns}
        error={records.error}
        getRowId={(row) => row.id}
        isLoading={records.isLoading}
        page={records.data}
        query={query}
        searchPlaceholder={t("TASK_SEARCH")}
        toolbar={
          <>
            <select
              aria-label={t("QUEUE_STATE")}
              className={FILTER}
              value={query.filters.state ?? ""}
              onChange={(event) => query.setFilter("state", event.target.value || undefined)}
            >
              <option value="">{t("ALL_STATES")}</option>
              {SYNC_QUEUE_STATES.map((s) => (
                <option key={s} value={s}>
                  {labels.queueState(s)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("ERROR_TYPE")}
              className={FILTER}
              value={query.filters.errorType ?? ""}
              onChange={(event) => query.setFilter("errorType", event.target.value || undefined)}
            >
              <option value="">{t("ALL_ERRORS")}</option>
              {ERROR_TYPES.map((e) => (
                <option key={e} value={e}>
                  {labels.errorType(e)}
                </option>
              ))}
            </select>
          </>
        }
      />
    </section>
  );
}
