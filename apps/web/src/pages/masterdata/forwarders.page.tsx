import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { RequirePermission } from "@/app/router/guards";
import { ToneBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog, type DeleteTarget } from "@/features/masterdata/components/delete-confirm-dialog";
import { FORWARDER_TYPES, ForwarderFormDialog } from "@/features/masterdata/components/forwarder-form-dialog";
import { useForwardersQuery } from "@/features/masterdata/reference-data.queries";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { ForwarderDto } from "@otd/contracts/masterdata";
import type { ColumnDef } from "@tanstack/react-table";

const SELECT_CLASS = "h-9 rounded-md border border-input bg-card px-2 text-sm";

export function ForwardersPage() {
  const { t } = useTranslation("masterdata");
  const { t: tc } = useTranslation();
  const query = useTableQueryState();
  const forwarders = useForwardersQuery(query.params);
  const [editing, setEditing] = useState<ForwarderDto | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);

  const columns = useMemo<ColumnDef<ForwarderDto, unknown>[]>(
    () => [
      {
        accessorKey: "code",
        header: t("COL_CODE"),
        cell: ({ row }) => <span className="tabular font-semibold">{row.original.code}</span>,
      },
      { accessorKey: "name", header: t("COL_NAME") },
      {
        accessorKey: "type",
        header: t("FORWARDER_TYPE"),
        cell: ({ row }) => (
          <ToneBadge
            label={row.original.type === "CARRIER" ? t("TYPE_CARRIER") : t("TYPE_FORWARDER")}
            tone={row.original.type === "CARRIER" ? "info" : "neutral"}
          />
        ),
      },
      { accessorKey: "contact", header: t("COL_CONTACT"), cell: ({ row }) => row.original.contact ?? "—" },
      {
        id: "actions",
        header: tc("TBL_ACTIONS"),
        cell: ({ row }) => (
          <RequirePermission code="masterdata.forwarder.edit">
            <Button className="h-auto px-2 py-1" variant="link" onClick={() => setEditing(row.original)}>
              {tc("1VV96U")}
            </Button>
            <Button
              className="h-auto px-2 py-1 text-destructive"
              variant="link"
              onClick={() =>
                setDeleting({ id: row.original.id, version: row.original.version, name: row.original.name })
              }
            >
              {tc("jAiN8T")}
            </Button>
          </RequirePermission>
        ),
      },
    ],
    [t, tc],
  );

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code="masterdata.forwarder.edit">
            <Button onClick={() => setEditing(null)}>{t("FORWARDER_NEW")}</Button>
          </RequirePermission>
        }
        title={t("FORWARDERS_TITLE")}
      />
      <ServerDataTable
        columns={columns}
        error={forwarders.error}
        getRowId={(row) => row.id}
        isLoading={forwarders.isLoading}
        page={forwarders.data}
        query={query}
        searchPlaceholder={t("FORWARDER_SEARCH")}
        toolbar={
          <select
            aria-label={t("FORWARDER_TYPE")}
            className={SELECT_CLASS}
            value={query.filters.type ?? ""}
            onChange={(event) => query.setFilter("type", event.target.value || undefined)}
          >
            <option value="">{t("ALL_TYPES")}</option>
            {FORWARDER_TYPES.map((type) => (
              <option key={type} value={type}>
                {type === "CARRIER" ? t("TYPE_CARRIER") : t("TYPE_FORWARDER")}
              </option>
            ))}
          </select>
        }
      />
      <ForwarderFormDialog
        forwarder={editing ?? null}
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
      />
      <DeleteConfirmDialog entity="forwarders" target={deleting} onClose={() => setDeleting(null)} />
    </section>
  );
}
