import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { RequirePermission } from "@/app/router/guards";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog, type DeleteTarget } from "@/features/masterdata/components/delete-confirm-dialog";
import { MachineFormDialog } from "@/features/masterdata/components/machine-form-dialog";
import { NeedleTypeFormDialog } from "@/features/masterdata/components/needle-type-form-dialog";
import { useBaseMachinesQuery, useBasesQuery, useNeedleTypesQuery } from "@/features/masterdata/reference-data.queries";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { BaseMachineDto, NeedleTypeDto } from "@otd/contracts/masterdata";
import type { ColumnDef } from "@tanstack/react-table";

const SELECT_CLASS = "h-9 rounded-md border border-input bg-card px-2 text-sm";

export function NeedleTypesPage() {
  const { t } = useTranslation("masterdata");
  const { t: tc } = useTranslation();
  const query = useTableQueryState();
  const needles = useNeedleTypesQuery();
  const bases = useBasesQuery();
  const machines = useBaseMachinesQuery(query.params);
  const [editingNeedle, setEditingNeedle] = useState<NeedleTypeDto | null | undefined>(undefined);
  const [editingMachine, setEditingMachine] = useState<BaseMachineDto | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const needleList = useMemo(() => needles.data?.items ?? [], [needles.data]);
  const baseList = useMemo(() => bases.data?.items ?? [], [bases.data]);

  const columns = useMemo<ColumnDef<BaseMachineDto, unknown>[]>(
    () => [
      {
        accessorKey: "baseName",
        header: t("MACHINE_BASE"),
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span className="tabular text-xs text-muted-foreground">{row.original.baseCode}</span>
            {row.original.baseName}
          </span>
        ),
      },
      {
        accessorKey: "needleCode",
        header: t("MACHINE_NEEDLE"),
        cell: ({ row }) => <span className="tabular font-semibold">{row.original.needleCode}</span>,
      },
      {
        accessorKey: "machineCount",
        header: t("MACHINE_COUNT"),
        meta: { align: "right" },
        cell: ({ row }) => <span className="tabular">{row.original.machineCount.toLocaleString()}</span>,
      },
      {
        accessorKey: "dailyOutputPerMachine",
        header: t("MACHINE_DAILY"),
        meta: { align: "right" },
        cell: ({ row }) => <span className="tabular">{row.original.dailyOutputPerMachine.toLocaleString()}</span>,
      },
      {
        accessorKey: "dailyCapacity",
        header: t("MACHINE_CAPACITY"),
        meta: { align: "right" },
        cell: ({ row }) => <span className="tabular font-semibold">{row.original.dailyCapacity.toLocaleString()}</span>,
      },
      {
        id: "actions",
        header: tc("TBL_ACTIONS"),
        cell: ({ row }) => (
          <RequirePermission code="masterdata.needle.edit">
            <Button className="h-auto px-2 py-1" variant="link" onClick={() => setEditingMachine(row.original)}>
              {tc("1VV96U")}
            </Button>
            <Button
              className="h-auto px-2 py-1 text-destructive"
              variant="link"
              onClick={() =>
                setDeleting({
                  id: row.original.id,
                  version: row.original.version,
                  name: `${row.original.baseName} ${row.original.needleCode}`,
                })
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
          <RequirePermission code="masterdata.needle.edit">
            <Button variant="outline" onClick={() => setEditingNeedle(null)}>
              {t("NEEDLE_NEW")}
            </Button>
            <Button onClick={() => setEditingMachine(null)}>{t("MACHINE_NEW")}</Button>
          </RequirePermission>
        }
        title={t("NEEDLES_TITLE")}
      />
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">{t("NEEDLE_LIST")}</h2>
        {needles.isLoading ? (
          <LoadingState />
        ) : needles.error ? (
          <ErrorState error={needles.error} />
        ) : (
          <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-muted-foreground">
                  <tr>
                    <th className="h-11 px-4 font-medium">{t("NEEDLE_CODE")}</th>
                    <th className="px-4 text-right font-medium">{t("NEEDLE_COUNT")}</th>
                    <th className="px-4 font-medium">{t("NEEDLE_DESC")}</th>
                    <th className="px-4 font-medium">{t("NEEDLE_MACHINES")}</th>
                    <th className="px-4 font-medium">{tc("TBL_ACTIONS")}</th>
                  </tr>
                </thead>
                <tbody>
                  {needleList.map((needle) => {
                    const total = needle.machines.reduce((sum, m) => sum + m.machineCount, 0);
                    return (
                      <tr className="h-12 border-t border-border hover:bg-muted/50" key={needle.id}>
                        <td className="tabular px-4 font-semibold">{needle.code}</td>
                        <td className="tabular px-4 text-right">{needle.needles}</td>
                        <td className="px-4 text-muted-foreground">{needle.description ?? "—"}</td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {needle.machines.map((m) => (
                              <span
                                className="tabular inline-flex h-6 items-center rounded-md bg-muted px-2 text-xs"
                                key={m.baseId}
                                title={`${m.dailyOutputPerMachine}`}
                              >
                                {t("MACHINE_SUMMARY", { base: m.baseName, count: m.machineCount })}
                              </span>
                            ))}
                            {needle.machines.length ? (
                              <span className="text-xs text-muted-foreground">
                                {t("NEEDLE_TOTAL", { count: total })}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4">
                          <RequirePermission code="masterdata.needle.edit">
                            <Button
                              aria-label={`${tc("1VV96U")} ${needle.code}`}
                              className="h-auto px-0"
                              variant="link"
                              onClick={() => setEditingNeedle(needle)}
                            >
                              {tc("1VV96U")}
                            </Button>
                          </RequirePermission>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">{t("MACHINES_TITLE")}</h2>
        <ServerDataTable
          columns={columns}
          error={machines.error}
          getRowId={(row) => row.id}
          isLoading={machines.isLoading}
          page={machines.data}
          query={query}
          searchable={false}
          toolbar={
            <select
              aria-label={t("BASE_FILTER")}
              className={SELECT_CLASS}
              value={query.filters.baseId ?? ""}
              onChange={(event) => query.setFilter("baseId", event.target.value || undefined)}
            >
              <option value="">{t("ALL_BASES")}</option>
              {baseList.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          }
        />
      </div>
      <NeedleTypeFormDialog
        needleType={editingNeedle ?? null}
        open={editingNeedle !== undefined}
        onOpenChange={(open) => !open && setEditingNeedle(undefined)}
      />
      <MachineFormDialog
        bases={baseList}
        machine={editingMachine ?? null}
        needleTypes={needleList}
        open={editingMachine !== undefined}
        onOpenChange={(open) => !open && setEditingMachine(undefined)}
      />
      <DeleteConfirmDialog
        description={t("MACHINE_DELETE_CONFIRM", { name: deleting?.name ?? "" })}
        entity="baseMachines"
        target={deleting}
        onClose={() => setDeleting(null)}
      />
    </section>
  );
}
