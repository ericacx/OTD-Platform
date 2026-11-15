import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { RequirePermission } from "@/app/router/guards";
import { SectionCard } from "@/components/biz/detail-header-card";
import { DocNoLink } from "@/components/biz/doc-no-link";
import { StatusBadge, ToneBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PromisedDate } from "@/features/purchase/components/promised-date";
import { ReceiveDialog } from "@/features/purchase/components/receive-dialog";
import { usePurchaseQuery, usePurchasesQuery, useReceiptsQuery } from "@/features/purchase/purchase.queries";
import { formatDate } from "@/lib/date";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { PurchaseReceiptDto } from "@/features/purchase/purchase.types";
import type { ColumnDef } from "@tanstack/react-table";

function ReceiveLauncher({ purchaseId, onDone }: { purchaseId: string; onDone: () => void }) {
  const purchase = usePurchaseQuery(purchaseId);
  return <ReceiveDialog purchase={purchase.data ?? null} onOpenChange={(v) => !v && onDone()} />;
}

export function PurchaseReceiptsPage() {
  const { t } = useTranslation("purchase");
  const query = useTableQueryState();
  const receipts = useReceiptsQuery(query.params);
  const pending = usePurchasesQuery({ status: "ORDERED,PARTIAL", pageSize: 100 });
  const [receiving, setReceiving] = useState<string | null>(null);

  const columns = useMemo<ColumnDef<PurchaseReceiptDto, unknown>[]>(
    () => [
      {
        accessorKey: "receivedAt",
        header: t("RECEIVED_AT"),
        cell: ({ row }) => <span className="tabular">{formatDate(row.original.receivedAt)}</span>,
      },
      {
        accessorKey: "purchaseDocNo",
        header: t("DOC_NO"),
        cell: ({ row }) => <DocNoLink no={row.original.purchaseDocNo} to={`/purchases/${row.original.purchaseId}`} />,
      },
      { accessorKey: "supplier", header: t("SUPPLIER") },
      { accessorKey: "lineName", header: t("LINE_NAME") },
      {
        accessorKey: "quantity",
        header: t("QUANTITY"),
        meta: { align: "right" },
        cell: ({ row }) => (
          <span className="tabular">{`${row.original.quantity.toLocaleString()} ${row.original.unit}`}</span>
        ),
      },
      {
        accessorKey: "qcResult",
        header: t("QC_RESULT"),
        cell: ({ row }) =>
          row.original.qcResult ? (
            <ToneBadge
              label={t(`QC_${row.original.qcResult}`)}
              tone={row.original.qcResult === "PASS" ? "success" : "danger"}
            />
          ) : (
            "—"
          ),
      },
      { accessorKey: "note", header: t("NOTE"), cell: ({ row }) => row.original.note ?? "—" },
      { accessorKey: "createdByName", header: t("RECORDED_BY"), cell: ({ row }) => row.original.createdByName ?? "—" },
    ],
    [t],
  );

  return (
    <section className="space-y-5">
      <PageHeader title={t("RECEIPTS_TITLE")} />
      <SectionCard
        bodyClassName="p-0"
        extra={t("PENDING_COUNT", { n: pending.data?.total ?? 0 })}
        title={t("PENDING_TITLE")}
      >
        {(pending.data?.items.length ?? 0) === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">{pending.isLoading ? t("LOADING") : t("PENDING_EMPTY")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">{t("DOC_NO")}</th>
                <th className="px-4 py-2 font-medium">{t("ORDER")}</th>
                <th className="px-4 py-2 font-medium">{t("SUPPLIER")}</th>
                <th className="px-4 py-2 font-medium">{t("PROMISED_DATE")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("RECEIVED_RATE")}</th>
                <th className="px-4 py-2 font-medium">{t("STATUS")}</th>
                <th className="px-4 py-2 font-medium">{t("ACTIONS")}</th>
              </tr>
            </thead>
            <tbody>
              {pending.data?.items.map((p) => (
                <tr className="border-t border-border" key={p.id}>
                  <td className="px-4 py-2">
                    <DocNoLink no={p.docNo} to={`/purchases/${p.id}`} />
                  </td>
                  <td className="tabular px-4 py-2">{p.poNo ?? "—"}</td>
                  <td className="px-4 py-2">{p.supplier}</td>
                  <td className="px-4 py-2">
                    <PromisedDate purchase={p} />
                  </td>
                  <td className="tabular px-4 py-2 text-right">{`${Math.round(p.receivedRate * 100)}%`}</td>
                  <td className="px-4 py-2">
                    <StatusBadge code={p.status} machine="purchase" />
                  </td>
                  <td className="px-4 py-2">
                    <RequirePermission code="purchase.receipt.create">
                      <Button className="h-auto px-1" variant="link" onClick={() => setReceiving(p.id)}>
                        {t("ACTION_RECEIVE")}
                      </Button>
                    </RequirePermission>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
      <ServerDataTable
        columns={columns}
        error={receipts.error}
        getRowId={(row) => row.id}
        isLoading={receipts.isLoading}
        page={receipts.data}
        query={query}
        searchPlaceholder={t("RECEIPT_SEARCH")}
        toolbar={
          <>
            <Input
              aria-label={t("FROM")}
              className="h-9 w-40"
              type="date"
              value={query.filters.from ?? ""}
              onChange={(event) => query.setFilter("from", event.target.value || undefined)}
            />
            <span className="text-muted-foreground">~</span>
            <Input
              aria-label={t("TO")}
              className="h-9 w-40"
              type="date"
              value={query.filters.to ?? ""}
              onChange={(event) => query.setFilter("to", event.target.value || undefined)}
            />
          </>
        }
      />
      {receiving ? <ReceiveLauncher purchaseId={receiving} onDone={() => setReceiving(null)} /> : null}
    </section>
  );
}
