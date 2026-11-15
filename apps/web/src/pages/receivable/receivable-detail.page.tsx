import { pickLabel, type DocType } from "@otd/shared";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

import { RequirePermission } from "@/app/router/guards";
import { DetailHeaderCard, SectionCard } from "@/components/biz/detail-header-card";
import { DocNoLink } from "@/components/biz/doc-no-link";
import { Money } from "@/components/biz/money";
import { StatusBadge, ToneBadge } from "@/components/biz/status-badge";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { leafByPermission } from "@/components/common/placeholder-page";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { PaidProgress } from "@/features/receivable/components/receivable-cells";
import { CollectionDialog, OffsetDialog, ReceiptDialog } from "@/features/receivable/components/receivable-dialogs";
import { isOpen, resultLabel, useDictLabel } from "@/features/receivable/receivable.labels";
import { useDisputeMutation } from "@/features/receivable/receivable.mutations";
import { useReceivableQuery } from "@/features/receivable/receivable.queries";
import { formatDate } from "@/lib/date";
import { usePublishPageDoc } from "@/stores/page-doc.store";

import type { CollectionLogDto, ReceiptDto } from "@otd/contracts/receivable";
import type { ColumnDef } from "@tanstack/react-table";

export function ReceivableDetailPage() {
  const { id = "" } = useParams();
  const { t, i18n } = useTranslation("receivable");
  const detail = useReceivableQuery(id);
  usePublishPageDoc(
    detail.data ? { docType: "receivable" satisfies DocType, docId: detail.data.id, docNo: detail.data.docNo } : null,
  );
  const dispute = useDisputeMutation();
  const typeLabel = useDictLabel("receivableType");
  const channelLabel = useDictLabel("collectionChannel");
  const [action, setAction] = useState<"receipt" | "collect" | "offset" | null>(null);
  const { group, leaf } = leafByPermission("receivable.receivable.view");

  const receiptColumns = useMemo<ColumnDef<ReceiptDto, unknown>[]>(
    () => [
      { accessorKey: "receivedAt", header: t("RECEIVED_AT") },
      {
        id: "amount",
        header: t("RECEIPT_AMOUNT_SHORT"),
        cell: ({ row }) => <Money amount={row.original.amount} currency={row.original.currency} />,
      },
      {
        id: "method",
        header: t("RECEIPT_METHOD"),
        cell: ({ row }) => (row.original.method === "OFFSET" ? t("OFFSET") : (row.original.method ?? "—")),
      },
      { id: "ref", header: t("BANK_REF"), cell: ({ row }) => row.original.bankRef ?? "—" },
      { id: "note", header: t("NOTE"), cell: ({ row }) => row.original.note ?? "—" },
      { id: "by", header: t("OPERATOR"), cell: ({ row }) => row.original.createdByName ?? "—" },
    ],
    [t],
  );
  const logColumns = useMemo<ColumnDef<CollectionLogDto, unknown>[]>(
    () => [
      { id: "at", header: t("LOGGED_AT"), cell: ({ row }) => formatDate(row.original.createdAt, true) },
      { id: "channel", header: t("CHANNEL"), cell: ({ row }) => channelLabel(row.original.channel) },
      {
        id: "result",
        header: t("COLLECTION_RESULT"),
        cell: ({ row }) => resultLabel(row.original.result, i18n.language),
      },
      { id: "next", header: t("NEXT_FOLLOW_UP"), cell: ({ row }) => row.original.nextFollowUp ?? "—" },
      { id: "note", header: t("NOTE"), cell: ({ row }) => row.original.note ?? "—" },
      { id: "by", header: t("OPERATOR"), cell: ({ row }) => row.original.createdByName ?? "—" },
    ],
    [t, channelLabel, i18n.language],
  );

  if (detail.isLoading) return <LoadingState />;
  if (detail.error || !detail.data) return <ErrorState error={detail.error} />;
  const ar = detail.data;

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <>
            {isOpen(ar) ? (
              <RequirePermission code="receivable.collection.log">
                <Button
                  variant="outline"
                  onClick={() =>
                    void dispute.mutateAsync({ id: ar.id, input: { version: ar.version, disputed: !ar.disputed } })
                  }
                >
                  {ar.disputed ? t("UNDISPUTE") : t("DISPUTE")}
                </Button>
                <Button variant="outline" onClick={() => setAction("collect")}>
                  {t("LOG_COLLECTION")}
                </Button>
              </RequirePermission>
            ) : null}
            {ar.status === "OFFSET_PENDING" ? (
              <RequirePermission code="receivable.receivable.receipt">
                <Button onClick={() => setAction("offset")}>{t("OFFSET")}</Button>
              </RequirePermission>
            ) : null}
            {isOpen(ar) && ar.amount > 0 ? (
              <RequirePermission code="receivable.receivable.receipt">
                <Button onClick={() => setAction("receipt")}>{t("RECEIPT")}</Button>
              </RequirePermission>
            ) : null}
          </>
        }
        crumbs={[
          { label: pickLabel(group.label, i18n.language) },
          { label: pickLabel(leaf.label, i18n.language), to: "/receivables" },
          { label: ar.docNo },
        ]}
        title={t("DETAIL_TITLE")}
      />
      <DetailHeaderCard
        fields={[
          { label: t("AR_NO"), value: <span className="tabular">{ar.docNo}</span> },
          { label: t("CUSTOMER"), value: ar.customerName },
          { label: t("SETTLEMENT_ENTITY"), value: ar.settlementEntity },
          { label: t("TYPE"), value: typeLabel(ar.type) },
          {
            label: t("AMOUNT"),
            value: <Money amount={ar.amount} className="font-semibold" currency={ar.currency} negativeDanger />,
          },
          { label: t("OUTSTANDING"), value: <Money amount={ar.outstanding} currency={ar.currency} /> },
          { label: t("DUE_DATE"), value: ar.dueDate },
          { label: t("OVERDUE"), value: ar.overdue ? t("DAYS_N", { n: ar.overdueDays }) : null },
          { label: t("PO"), value: ar.poNo },
          {
            label: t("SHIPMENT_NO"),
            value: ar.shipmentId ? <DocNoLink no={ar.shipmentNo} to={`/shipments/${ar.shipmentId}`} /> : null,
          },
          { label: t("SOURCE_NO"), value: ar.sourceNo },
          { label: t("INVOICE_NO"), value: ar.invoiceNo },
          { label: t("OWNER"), value: ar.ownerName },
          { label: t("CHASED"), value: t("TIMES_N", { n: ar.collectionCount }) },
          { label: t("NEXT_FOLLOW_UP"), value: ar.nextFollowUp },
          { label: t("PAID_OF"), value: <PaidProgress ar={ar} /> },
          { label: t("NOTE"), value: ar.note, span: "full" },
        ]}
        subtitle={[ar.customerName, ar.settlementEntity, ar.poNo ?? ar.sourceNo].filter(Boolean).join(" ｜ ")}
        tags={
          <>
            <ToneBadge label={ar.customerName} tone="info" />
            <StatusBadge code={ar.status} machine="receivable" />
            {ar.overdue ? <ToneBadge label={t("OVERDUE_TAG")} tone="danger" /> : null}
            {ar.disputed ? <ToneBadge label={t("DISPUTED")} tone="danger" /> : null}
            {ar.missingData ? <ToneBadge label={t("MISSING_DATA")} tone="warning" /> : null}
          </>
        }
        title={`${ar.docNo} · ${typeLabel(ar.type)}`}
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard bodyClassName="p-0" title={t("RECEIPTS_CARD")}>
          <DataTable columns={receiptColumns} data={ar.receipts} getRowId={(r) => r.id} />
        </SectionCard>
        <SectionCard bodyClassName="p-0" title={t("COLLECTIONS_CARD")}>
          <DataTable columns={logColumns} data={ar.collections} getRowId={(r) => r.id} />
        </SectionCard>
      </div>
      <ReceiptDialog receivable={action === "receipt" ? ar : null} onClose={() => setAction(null)} />
      <CollectionDialog receivable={action === "collect" ? ar : null} onClose={() => setAction(null)} />
      <OffsetDialog receivable={action === "offset" ? ar : null} onClose={() => setAction(null)} />
    </section>
  );
}
