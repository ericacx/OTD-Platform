import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { RequirePermission } from "@/app/router/guards";
import { DocNoLink } from "@/components/biz/doc-no-link";
import { StatusBadge, ToneBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { CartonAdjustDialog } from "@/features/packaging/components/carton-adjust-dialog";
import { CustomerFilter, StatusFilter } from "@/features/packaging/components/status-filter";
import { useCartonActionMutation } from "@/features/packaging/packaging.mutations";
import { useCartonCoverageQuery, useCartonsQuery } from "@/features/packaging/packaging.queries";
import { formatDate } from "@/lib/date";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { CartonDto } from "@/features/packaging/packaging.types";
import type { ColumnDef } from "@tanstack/react-table";

export function CartonsPage() {
  const { t } = useTranslation("packaging");
  const query = useTableQueryState();
  const cartons = useCartonsQuery(query.params);
  const lookups = useLookups();
  const coverage = useCartonCoverageQuery(query.filters.orderId);
  const action = useCartonActionMutation();
  const [adjusting, setAdjusting] = useState<CartonDto | null>(null);

  const columns = useMemo<ColumnDef<CartonDto, unknown>[]>(() => {
    const act = (row: CartonDto, kind: "start" | "finish") => {
      action.mutate(
        { id: row.id, kind, version: row.version },
        {
          onSuccess: () => toast.success(kind === "start" ? t("DONE_START") : t("DONE_FINISH")),
          onError: (err) => toast.error(err.message),
        },
      );
    };
    const num = (value: number) => <span className="tabular">{value.toLocaleString()}</span>;
    return [
      { accessorKey: "docNo", header: t("CARTON_NO"), cell: ({ row }) => <DocNoLink no={row.original.docNo} /> },
      { accessorKey: "customerName", header: t("CUSTOMER") },
      {
        accessorKey: "poNo",
        header: t("CUSTOMER_PO"),
        cell: ({ row }) => <DocNoLink no={row.original.poNo} to={`/orders/${row.original.orderId}`} />,
      },
      {
        accessorKey: "styleNo",
        header: t("STYLE_NO"),
        cell: ({ row }) => (row.original.styleNo ? `#${row.original.styleNo}` : "—"),
      },
      {
        accessorKey: "customerSku",
        header: t("CUSTOMER_SKU"),
        cell: ({ row }) => <span className="tabular">{row.original.customerSku ?? "—"}</span>,
      },
      { accessorKey: "size", header: t("SIZE") },
      {
        accessorKey: "pairs",
        header: t("PAIRS"),
        meta: { align: "right" },
        cell: ({ row }) => num(row.original.pairs),
      },
      {
        accessorKey: "pairsPerCarton",
        header: t("F_pairsPerCarton"),
        meta: { align: "right" },
        cell: ({ row }) => num(row.original.pairsPerCarton),
      },
      {
        accessorKey: "cartonCount",
        header: t("CARTON_COUNT"),
        meta: { align: "right" },
        cell: ({ row }) => num(row.original.cartonCount),
      },
      {
        accessorKey: "cartonRange",
        header: t("CARTON_RANGE"),
        cell: ({ row }) => <span className="tabular">{row.original.cartonRange ?? "—"}</span>,
      },
      {
        accessorKey: "tailPairs",
        header: t("TAIL_CARTON"),
        meta: { align: "right" },
        cell: ({ row }) =>
          row.original.tailPairs ? (
            <ToneBadge label={t("TAIL_PAIRS", { n: row.original.tailPairs })} tone="warning" />
          ) : (
            "—"
          ),
      },
      {
        accessorKey: "packDueDate",
        header: t("PACK_DUE"),
        cell: ({ row }) => <span className="tabular">{formatDate(row.original.packDueDate)}</span>,
      },
      {
        accessorKey: "status",
        header: t("STATUS"),
        cell: ({ row }) => <StatusBadge code={row.original.status} machine="carton" />,
      },
      {
        id: "actions",
        header: t("ACTIONS"),
        cell: ({ row }) => (
          <RequirePermission code="packaging.carton.edit">
            <div className="flex gap-1 whitespace-nowrap">
              {row.original.status === "TO_PACK" ? (
                <>
                  <Button className="h-auto px-1" variant="link" onClick={() => act(row.original, "start")}>
                    {t("ACTION_START")}
                  </Button>
                  <Button className="h-auto px-1" variant="link" onClick={() => setAdjusting(row.original)}>
                    {t("ACTION_ADJUST")}
                  </Button>
                </>
              ) : null}
              {row.original.status === "PACKING" ? (
                <Button className="h-auto px-1" variant="link" onClick={() => act(row.original, "finish")}>
                  {t("ACTION_FINISH")}
                </Button>
              ) : null}
            </div>
          </RequirePermission>
        ),
      },
    ];
  }, [t, action]);

  return (
    <section className="space-y-5">
      <PageHeader title={t("CARTONS_TITLE")} />
      {coverage.data ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-border bg-card px-4 py-3 text-sm">
          <ToneBadge
            label={coverage.data.covered ? t("COVERAGE_OK") : t("COVERAGE_MISSING")}
            tone={coverage.data.covered ? "success" : "warning"}
          />
          <span className="text-muted-foreground">
            {t("COVERAGE_TEXT", { covered: coverage.data.coveredLineCount, total: coverage.data.lineCount })}
          </span>
        </div>
      ) : null}
      <ServerDataTable
        columns={columns}
        error={cartons.error}
        getRowId={(row) => row.id}
        isLoading={cartons.isLoading}
        page={cartons.data}
        query={query}
        searchPlaceholder={t("CARTON_SEARCH")}
        toolbar={
          <>
            <CustomerFilter
              allLabel={t("ALL_CUSTOMERS")}
              customers={lookups.data?.customers ?? []}
              label={t("CUSTOMER")}
              value={query.filters.customerId}
              onChange={(v) => query.setFilter("customerId", v)}
            />
            <StatusFilter
              allLabel={t("ALL_CARTON_STATUS")}
              label={t("STATUS")}
              machine="carton"
              value={query.filters.status}
              onChange={(v) => query.setFilter("status", v)}
            />
          </>
        }
      />
      <CartonAdjustDialog carton={adjusting} onOpenChange={(open) => !open && setAdjusting(null)} />
    </section>
  );
}
