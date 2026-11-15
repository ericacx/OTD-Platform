import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { RequirePermission } from "@/app/router/guards";
import { DocNoLink } from "@/components/biz/doc-no-link";
import { Money } from "@/components/biz/money";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { InvoiceDialog } from "@/features/receivable/components/receivable-dialogs";
import { useInvoicesQuery } from "@/features/receivable/receivable.queries";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { InvoiceDto } from "@otd/contracts/receivable";
import type { ColumnDef } from "@tanstack/react-table";

export function InvoicesPage() {
  const { t } = useTranslation("receivable");
  const query = useTableQueryState();
  const list = useInvoicesQuery(query.params);
  const lookups = useLookups();
  const [creating, setCreating] = useState(false);

  const columns = useMemo<ColumnDef<InvoiceDto, unknown>[]>(
    () => [
      {
        accessorKey: "invoiceNo",
        header: t("INVOICE_NO"),
        cell: ({ row }) => <span className="tabular font-medium">{row.original.invoiceNo}</span>,
      },
      { accessorKey: "customerName", header: t("CUSTOMER") },
      { id: "po", header: t("PO"), cell: ({ row }) => <span className="tabular">{row.original.poNo ?? "—"}</span> },
      {
        id: "shipment",
        header: t("SHIPMENT_NO"),
        cell: ({ row }) =>
          row.original.shipmentId ? (
            <DocNoLink no={row.original.shipmentNo} to={`/shipments/${row.original.shipmentId}`} />
          ) : (
            "—"
          ),
      },
      {
        id: "ar",
        header: t("AR_NO"),
        cell: ({ row }) =>
          row.original.receivableId ? (
            <DocNoLink no={row.original.receivableNo} to={`/receivables/${row.original.receivableId}`} />
          ) : (
            "—"
          ),
      },
      {
        id: "amount",
        header: t("INVOICE_AMOUNT"),
        meta: { align: "right" },
        cell: ({ row }) => (
          <Money amount={row.original.amount} className="font-semibold" currency={row.original.currency} />
        ),
      },
      {
        accessorKey: "issuedDate",
        header: t("ISSUED_DATE"),
        cell: ({ row }) => <span className="tabular">{row.original.issuedDate}</span>,
      },
      { accessorKey: "ownerName", header: t("OWNER") },
      { id: "note", header: t("NOTE"), cell: ({ row }) => row.original.note ?? "—" },
    ],
    [t],
  );

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code="receivable.invoice.create">
            <Button onClick={() => setCreating(true)}>{t("INVOICE_NEW")}</Button>
          </RequirePermission>
        }
        description={t("INVOICES_DESC")}
        title={t("INVOICES_TITLE")}
      />
      <ServerDataTable
        columns={columns}
        error={list.error}
        getRowId={(row) => row.id}
        isLoading={list.isLoading}
        page={list.data}
        query={query}
        searchPlaceholder={t("INVOICE_SEARCH")}
        toolbar={
          <select
            aria-label={t("CUSTOMER")}
            className="h-9 rounded-md border border-input bg-card px-2 text-sm"
            value={query.filters.customerId ?? ""}
            onChange={(event) => query.setFilter("customerId", event.target.value || undefined)}
          >
            <option value="">{t("ALL_CUSTOMERS")}</option>
            {(lookups.data?.customers ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        }
      />
      <InvoiceDialog open={creating} onOpenChange={setCreating} />
    </section>
  );
}
