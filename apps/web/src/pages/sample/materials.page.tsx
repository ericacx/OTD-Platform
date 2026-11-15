import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";

import { RequirePermission } from "@/app/router/guards";
import { ToneBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { MaterialFormDialog } from "@/features/sample/components/library-dialogs";
import { useArriveMaterialMutation } from "@/features/sample/sample.mutations";
import { useMaterialsQuery } from "@/features/sample/sample.queries";
import { formatDate } from "@/lib/date";
import { formatNumber } from "@/lib/format";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";
import { cn } from "@/lib/utils";

import type { MaterialDto } from "@/features/sample/sample.types";
import type { ColumnDef } from "@tanstack/react-table";

const SELECT = "h-9 rounded-md border border-input bg-card px-2 text-sm";

export function MaterialsPage() {
  const { t } = useTranslation("sample");
  const { t: tc } = useTranslation();
  const query = useTableQueryState();
  const materials = useMaterialsQuery(query.params);
  const arrive = useArriveMaterialMutation();
  const [creating, setCreating] = useState(false);

  const columns = useMemo<ColumnDef<MaterialDto, unknown>[]>(
    () => [
      {
        id: "sample",
        header: t("F_SAMPLE"),
        cell: ({ row }) => (
          <div className="leading-tight">
            <Link
              className="tabular font-semibold whitespace-nowrap text-primary hover:underline"
              to={`/samples/${row.original.sampleId}`}
            >
              {row.original.sampleDocNo}
            </Link>
            <div className="text-xs text-muted-foreground">
              #{row.original.styleNo} · {row.original.customerName}
            </div>
          </div>
        ),
      },
      {
        id: "name",
        header: t("MAT_NAME"),
        cell: ({ row }) => <span className="font-medium">{row.original.materialName}</span>,
      },
      { id: "spec", header: t("MAT_SPEC"), cell: ({ row }) => row.original.spec ?? "—" },
      {
        id: "qty",
        header: t("F_QTY"),
        meta: { align: "right" },
        cell: ({ row }) => (
          <span className="tabular">
            {row.original.quantity !== null
              ? `${formatNumber(row.original.quantity, 1)} ${row.original.unit ?? ""}`
              : "—"}
          </span>
        ),
      },
      { id: "supplier", header: t("MAT_SUPPLIER"), cell: ({ row }) => row.original.supplier ?? "—" },
      {
        id: "arrival",
        header: t("MAT_ARRIVAL"),
        cell: ({ row }) => (
          <span className={cn("tabular", row.original.overdue && "font-medium text-danger")}>
            {row.original.arrivalDate ?? "—"}
          </span>
        ),
      },
      {
        id: "status",
        header: t("COL_STATUS"),
        cell: ({ row }) =>
          row.original.status === "ARRIVED" ? (
            <ToneBadge label={t("MAT_ARRIVED")} tone="success" />
          ) : (
            <ToneBadge
              label={row.original.overdue ? t("MAT_OVERDUE") : t("MAT_PENDING")}
              tone={row.original.overdue ? "danger" : "warning"}
            />
          ),
      },
      {
        id: "arrivedAt",
        header: t("MAT_ARRIVED_AT"),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">{formatDate(row.original.arrivedAt, true)}</span>
        ),
      },
      {
        id: "actions",
        header: tc("TBL_ACTIONS"),
        cell: ({ row }) =>
          row.original.status === "PENDING" ? (
            <RequirePermission code="sample.material.edit">
              <Button
                className="h-auto px-1"
                variant="link"
                onClick={() =>
                  void arrive
                    .mutateAsync({ id: row.original.id, version: row.original.version })
                    .then(() => toast.success(t("MAT_ARRIVE_OK")))
                    .catch((err: unknown) => toast.error(err instanceof Error ? err.message : tc("BIZERR")))
                }
              >
                {t("MAT_ARRIVE")}
              </Button>
            </RequirePermission>
          ) : null,
      },
    ],
    [t, tc, arrive],
  );

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code="sample.material.edit">
            <Button onClick={() => setCreating(true)}>{t("MAT_NEW")}</Button>
          </RequirePermission>
        }
        title={t("MATERIALS_PAGE_TITLE")}
      />
      <ServerDataTable
        columns={columns}
        error={materials.error}
        getRowId={(row) => row.id}
        isLoading={materials.isLoading}
        page={materials.data}
        query={query}
        searchPlaceholder={t("MAT_SEARCH")}
        toolbar={
          <select
            aria-label={t("COL_STATUS")}
            className={SELECT}
            value={query.filters.status ?? ""}
            onChange={(e) => query.setFilter("status", e.target.value || undefined)}
          >
            <option value="">{t("ALL_STATUS")}</option>
            <option value="PENDING">{t("MAT_PENDING")}</option>
            <option value="ARRIVED">{t("MAT_ARRIVED")}</option>
          </select>
        }
      />
      <MaterialFormDialog open={creating} onOpenChange={setCreating} />
    </section>
  );
}
