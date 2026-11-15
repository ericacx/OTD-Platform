import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { RequirePermission } from "@/app/router/guards";
import { DocNoLink } from "@/components/biz/doc-no-link";
import { Money } from "@/components/biz/money";
import { StatusBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { CustomerFilter, StatusFilter } from "@/features/packaging/components/status-filter";
import { PromisedDate } from "@/features/purchase/components/promised-date";
import { PurchaseFormDialog } from "@/features/purchase/components/purchase-form-dialog";
import { usePurchasesQuery } from "@/features/purchase/purchase.queries";
import { PURCHASE_CATEGORIES } from "@/features/purchase/purchase.types";
import { formatDate } from "@/lib/date";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { PurchaseDto } from "@/features/purchase/purchase.types";
import type { ColumnDef } from "@tanstack/react-table";

export function PurchasesPage() {
  const { t } = useTranslation("purchase");
  const navigate = useNavigate();
  const query = useTableQueryState();
  const purchases = usePurchasesQuery(query.params);
  const lookups = useLookups();
  const [creating, setCreating] = useState(false);

  const columns = useMemo<ColumnDef<PurchaseDto, unknown>[]>(
    () => [
      {
        accessorKey: "docNo",
        header: t("DOC_NO"),
        cell: ({ row }) => <DocNoLink no={row.original.docNo} to={`/purchases/${row.original.id}`} />,
      },
      { accessorKey: "customerName", header: t("CUSTOMER") },
      {
        accessorKey: "poNo",
        header: t("ORDER"),
        cell: ({ row }) => (
          <DocNoLink
            no={row.original.poNo ?? row.original.sampleNo}
            {...(row.original.orderId ? { to: `/orders/${row.original.orderId}` } : {})}
          />
        ),
      },
      { accessorKey: "supplier", header: t("SUPPLIER") },
      { accessorKey: "category", header: t("CATEGORY"), cell: ({ row }) => t(`CAT_${row.original.category}`) },
      {
        accessorKey: "orderedAt",
        header: t("ORDERED_AT"),
        cell: ({ row }) => <span className="tabular">{formatDate(row.original.orderedAt)}</span>,
      },
      {
        accessorKey: "promisedDate",
        header: t("PROMISED_DATE"),
        cell: ({ row }) => <PromisedDate purchase={row.original} />,
      },
      {
        accessorKey: "receivedRate",
        header: t("RECEIVED_RATE"),
        meta: { align: "right" },
        cell: ({ row }) => <span className="tabular">{`${Math.round(row.original.receivedRate * 100)}%`}</span>,
      },
      {
        accessorKey: "amount",
        header: t("AMOUNT"),
        meta: { align: "right" },
        cell: ({ row }) => <Money amount={row.original.amount} currency="CNY" />,
      },
      {
        accessorKey: "status",
        header: t("STATUS"),
        cell: ({ row }) => <StatusBadge code={row.original.status} machine="purchase" />,
      },
      { accessorKey: "ownerName", header: t("BUYER") },
    ],
    [t],
  );

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code="purchase.order.create">
            <Button onClick={() => setCreating(true)}>{t("PURCHASE_NEW")}</Button>
          </RequirePermission>
        }
        title={t("PURCHASES_TITLE")}
      />
      <ServerDataTable
        columns={columns}
        error={purchases.error}
        getRowId={(row) => row.id}
        isLoading={purchases.isLoading}
        page={purchases.data}
        query={query}
        searchPlaceholder={t("PURCHASE_SEARCH")}
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
              allLabel={t("ALL_STATUS")}
              label={t("STATUS")}
              machine="purchase"
              value={query.filters.status}
              onChange={(v) => query.setFilter("status", v)}
            />
            <select
              aria-label={t("CATEGORY")}
              className="h-9 rounded-md border border-input bg-card px-2 text-sm"
              value={query.filters.category ?? ""}
              onChange={(event) => query.setFilter("category", event.target.value || undefined)}
            >
              <option value="">{t("ALL_CATEGORIES")}</option>
              {PURCHASE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`CAT_${c}`)}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                checked={query.filters.overdue === "true"}
                type="checkbox"
                onChange={(event) => query.setFilter("overdue", event.target.checked ? "true" : undefined)}
              />
              {t("ONLY_OVERDUE")}
            </label>
          </>
        }
        onRowClick={(row) => void navigate(`/purchases/${row.id}`)}
      />
      <PurchaseFormDialog
        open={creating}
        onCreated={(p) => void navigate(`/purchases/${p.id}`)}
        onOpenChange={setCreating}
      />
    </section>
  );
}
