import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useHasPermission } from "@/app/providers/auth-provider";
import { RequirePermission } from "@/app/router/guards";
import { ToneBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { MappingEditorDialog } from "@/features/sync/components/mapping-editor-dialog";
import { SYNC_DIRECTIONS, SYNC_OBJECTS, useSyncLabels } from "@/features/sync/sync.labels";
import { useSyncEndpointsQuery, useSyncMappingsQuery } from "@/features/sync/sync.queries";
import { formatDate } from "@/lib/date";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { SyncMappingDto } from "@/features/sync/sync.types";
import type { ColumnDef } from "@tanstack/react-table";

const FILTER = "h-9 rounded-md border border-input bg-card px-2 text-sm";

export function MappingsPage() {
  const { t } = useTranslation("sync");
  const { t: tc } = useTranslation();
  const labels = useSyncLabels();
  const query = useTableQueryState();
  const mappings = useSyncMappingsQuery(query.params);
  const endpoints = useSyncEndpointsQuery({ pageSize: 200 });
  const canEdit = useHasPermission("sync.mapping.edit");
  const [editing, setEditing] = useState<SyncMappingDto | null | undefined>(undefined);

  const columns = useMemo<ColumnDef<SyncMappingDto, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("NAME"),
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      { accessorKey: "endpointName", header: t("ENDPOINT") },
      { accessorKey: "object", header: t("OBJECT"), cell: ({ row }) => labels.object(row.original.object) },
      {
        accessorKey: "direction",
        header: t("DIRECTION"),
        cell: ({ row }) => <ToneBadge label={labels.direction(row.original.direction)} tone="info" />,
      },
      {
        id: "fields",
        header: t("FIELDS"),
        meta: { align: "right" },
        cell: ({ row }) => <span className="tabular">{row.original.fields.length}</span>,
      },
      {
        id: "codeMaps",
        header: t("CODE_MAPS"),
        cell: ({ row }) => {
          const names = Object.keys(row.original.codeMaps);
          return names.length ? <span className="font-mono text-xs">{names.join(", ")}</span> : "—";
        },
      },
      {
        accessorKey: "taskCount",
        header: t("TASK_COUNT"),
        meta: { align: "right" },
        cell: ({ row }) => <span className="tabular">{row.original.taskCount}</span>,
      },
      {
        accessorKey: "updatedAt",
        header: t("UPDATED_AT"),
        cell: ({ row }) => <span className="tabular">{formatDate(row.original.updatedAt, true)}</span>,
      },
      {
        id: "actions",
        header: tc("TBL_ACTIONS"),
        cell: ({ row }) => (
          <Button className="h-auto px-1" variant="link" onClick={() => setEditing(row.original)}>
            {canEdit ? tc("1VV96U") : t("PREVIEW")}
          </Button>
        ),
      },
    ],
    [t, tc, labels, canEdit],
  );

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code="sync.mapping.edit">
            <Button onClick={() => setEditing(null)}>{t("MAPPING_NEW")}</Button>
          </RequirePermission>
        }
        description={t("MAPPINGS_NOTE")}
        title={t("MAPPINGS_TITLE")}
      />
      <ServerDataTable
        columns={columns}
        error={mappings.error}
        getRowId={(row) => row.id}
        isLoading={mappings.isLoading}
        page={mappings.data}
        query={query}
        searchPlaceholder={t("MAPPING_SEARCH")}
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
          </>
        }
      />
      <MappingEditorDialog
        endpoints={endpoints.data?.items ?? []}
        mapping={editing ?? null}
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
      />
    </section>
  );
}
