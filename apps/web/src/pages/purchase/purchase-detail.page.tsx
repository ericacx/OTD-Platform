import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { toast } from "sonner";

import { RequirePermission } from "@/app/router/guards";
import { DetailHeaderCard, SectionCard } from "@/components/biz/detail-header-card";
import { DocNoLink } from "@/components/biz/doc-no-link";
import { Money } from "@/components/biz/money";
import { PrimaryTag, StatusBadge, ToneBadge } from "@/components/biz/status-badge";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { PromisedDate } from "@/features/purchase/components/promised-date";
import { PurchaseFormDialog, type PurchaseDraft } from "@/features/purchase/components/purchase-form-dialog";
import { ReceiveDialog } from "@/features/purchase/components/receive-dialog";
import { RequirementsCard } from "@/features/purchase/components/requirements-card";
import { useCancelPurchaseMutation } from "@/features/purchase/purchase.mutations";
import { usePurchaseQuery } from "@/features/purchase/purchase.queries";
import { formatDate } from "@/lib/date";
import { usePublishPageDoc } from "@/stores/page-doc.store";

import type { PurchaseDetailDto, PurchaseRequirementDto } from "@/features/purchase/purchase.types";

export function PurchaseDetailPage() {
  const { id } = useParams();
  const purchase = usePurchaseQuery(id);
  if (purchase.isLoading) return <LoadingState className="m-6" />;
  if (purchase.error || !purchase.data) return <ErrorState error={purchase.error} />;
  return <PurchaseDetail purchase={purchase.data} />;
}

function shortageDraft(req: PurchaseRequirementDto, orderId: string): PurchaseDraft {
  const items = req.items.filter((i) => i.shortage > 0);
  const category = items.some((i) => i.category === "YARN") ? "YARN" : "PACKAGING";
  return {
    orderId,
    category,
    lines: items
      .filter((i) => i.category === category)
      .map((i) => ({
        materialId: i.materialId ?? "",
        name: i.materialId ? "" : i.name,
        unit: i.unit,
        quantity: i.shortage,
      })),
  };
}

function PurchaseDetail({ purchase }: { purchase: PurchaseDetailDto }) {
  const { t } = useTranslation("purchase");
  const cancel = useCancelPurchaseMutation(purchase.id);
  const [receiving, setReceiving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [draft, setDraft] = useState<PurchaseDraft | null>(null);
  const open = purchase.status === "ORDERED" || purchase.status === "PARTIAL";
  usePublishPageDoc({ docType: "purchase", docId: purchase.id, docNo: purchase.docNo });

  return (
    <section className="space-y-5">
      <DetailHeaderCard
        actions={
          <>
            {open ? (
              <RequirePermission code="purchase.receipt.create">
                <Button onClick={() => setReceiving(true)}>{t("ACTION_RECEIVE")}</Button>
              </RequirePermission>
            ) : null}
            {purchase.status === "ORDERED" ? (
              <RequirePermission code="purchase.order.cancel">
                <Button variant="outline" onClick={() => setCancelling(true)}>
                  {t("ACTION_CANCEL")}
                </Button>
              </RequirePermission>
            ) : null}
          </>
        }
        fields={[
          { label: t("DOC_NO"), value: <span className="tabular">{purchase.docNo}</span> },
          { label: t("CUSTOMER"), value: purchase.customerName },
          {
            label: t("ORDER"),
            value: (
              <DocNoLink
                no={purchase.poNo ?? purchase.sampleNo}
                {...(purchase.orderId ? { to: `/orders/${purchase.orderId}` } : {})}
              />
            ),
          },
          { label: t("SUPPLIER"), value: purchase.supplier },
          { label: t("CATEGORY"), value: t(`CAT_${purchase.category}`) },
          { label: t("ORDERED_AT"), value: formatDate(purchase.orderedAt) },
          { label: t("PROMISED_DATE"), value: <PromisedDate purchase={purchase} /> },
          { label: t("RECEIVED_AT"), value: purchase.receivedAt ? formatDate(purchase.receivedAt) : null },
          { label: t("DELIVERY_PLACE"), value: purchase.deliveryPlace },
          { label: t("AMOUNT"), value: <Money amount={purchase.amount} currency="CNY" /> },
          { label: t("RECEIVED_RATE"), value: `${Math.round(purchase.receivedRate * 100)}%` },
          { label: t("BUYER"), value: purchase.ownerName },
          { label: t("NOTE"), value: purchase.note, span: 2 },
          ...(purchase.cancelReason
            ? [{ label: t("CANCEL_REASON"), value: purchase.cancelReason, span: 2 as const }]
            : []),
        ]}
        subtitle={`${purchase.supplier} ｜ ${t(`CAT_${purchase.category}`)} ｜ ${t("LINE_COUNT", { n: purchase.lineCount })}`}
        tags={
          <>
            <PrimaryTag>{purchase.customerName}</PrimaryTag>
            <StatusBadge code={purchase.status} machine="purchase" />
            {purchase.overdue ? (
              <ToneBadge label={t("OVERDUE_DAYS", { days: purchase.overdueDays })} tone="danger" />
            ) : null}
          </>
        }
        title={`${purchase.docNo} · ${purchase.supplier}`}
      />
      <SectionCard bodyClassName="p-0" title={t("LINES")}>
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">{t("LINE_NAME")}</th>
              <th className="px-4 py-2 font-medium">{t("SPEC")}</th>
              <th className="px-4 py-2 text-right font-medium">{t("QUANTITY")}</th>
              <th className="px-4 py-2 text-right font-medium">{t("UNIT_PRICE")}</th>
              <th className="px-4 py-2 text-right font-medium">{t("RECEIVED")}</th>
              <th className="px-4 py-2 text-right font-medium">{t("REMAINING")}</th>
            </tr>
          </thead>
          <tbody>
            {purchase.lines.map((l) => (
              <tr className="border-t border-border" key={l.id}>
                <td className="px-4 py-2">
                  <div className="font-medium">{l.name}</div>
                  {l.materialCode ? <div className="text-xs text-muted-foreground">{l.materialCode}</div> : null}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{l.spec ?? "—"}</td>
                <td className="tabular px-4 py-2 text-right">{`${l.quantity.toLocaleString()} ${l.unit}`}</td>
                <td className="px-4 py-2 text-right">
                  {l.unitPrice === null ? "—" : <Money amount={l.unitPrice} currency="CNY" />}
                </td>
                <td className="tabular px-4 py-2 text-right">{l.receivedQty.toLocaleString()}</td>
                <td className="tabular px-4 py-2 text-right">
                  {l.remainingQty > 0 ? (
                    <span className="font-medium text-warning">{l.remainingQty.toLocaleString()}</span>
                  ) : (
                    "0"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
      <SectionCard bodyClassName="p-0" title={t("RECEIPTS")}>
        {purchase.receipts.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">{t("NO_RECEIPTS")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">{t("RECEIVED_AT")}</th>
                <th className="px-4 py-2 font-medium">{t("LINE_NAME")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("QUANTITY")}</th>
                <th className="px-4 py-2 font-medium">{t("QC_RESULT")}</th>
                <th className="px-4 py-2 font-medium">{t("NOTE")}</th>
                <th className="px-4 py-2 font-medium">{t("RECORDED_BY")}</th>
              </tr>
            </thead>
            <tbody>
              {purchase.receipts.map((r) => (
                <tr className="border-t border-border" key={r.id}>
                  <td className="tabular px-4 py-2">{formatDate(r.receivedAt)}</td>
                  <td className="px-4 py-2">{r.lineName}</td>
                  <td className="tabular px-4 py-2 text-right">{`${r.quantity.toLocaleString()} ${r.unit}`}</td>
                  <td className="px-4 py-2">
                    {r.qcResult ? (
                      <ToneBadge label={t(`QC_${r.qcResult}`)} tone={r.qcResult === "PASS" ? "success" : "danger"} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{r.note ?? "—"}</td>
                  <td className="px-4 py-2">{r.createdByName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
      {purchase.orderId ? (
        <RequirementsCard
          action={(req) =>
            req.items.some((i) => i.shortage > 0) ? (
              <RequirePermission code="purchase.order.create">
                <Button size="sm" variant="outline" onClick={() => setDraft(shortageDraft(req, purchase.orderId!))}>
                  {t("REQ_CREATE")}
                </Button>
              </RequirePermission>
            ) : null
          }
          orderId={purchase.orderId}
        />
      ) : null}
      <ReceiveDialog purchase={receiving ? purchase : null} onOpenChange={(v) => !v && setReceiving(false)} />
      <PurchaseFormDialog draft={draft} open={draft !== null} onOpenChange={(v) => !v && setDraft(null)} />
      <ConfirmDialog
        description={t("CANCEL_DESC", { docNo: purchase.docNo })}
        isProcessing={cancel.isPending}
        open={cancelling}
        title={t("ACTION_CANCEL")}
        variant="destructive"
        onConfirm={async () => {
          try {
            await cancel.mutateAsync({ version: purchase.version });
            toast.success(t("DONE_CANCEL"));
          } catch (err) {
            toast.error(err instanceof Error ? err.message : t("FAILED"));
          } finally {
            setCancelling(false);
          }
        }}
        onOpenChange={setCancelling}
      />
    </section>
  );
}
