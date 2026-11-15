import { pickLabel } from "@otd/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

import { RequirePermission } from "@/app/router/guards";
import { DetailHeaderCard, SectionCard } from "@/components/biz/detail-header-card";
import { ProgressTimeline, type TimelineStep } from "@/components/biz/progress-timeline";
import { StatusBadge, ToneBadge } from "@/components/biz/status-badge";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { leafByPermission } from "@/components/common/placeholder-page";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { SendDialog } from "@/features/sampleship/components/send-dialog";
import { useSignShipmentMutation } from "@/features/sampleship/sampleship.mutations";
import { useShipmentQuery } from "@/features/sampleship/sampleship.queries";
import { formatDate } from "@/lib/date";

export function ShipmentDetailPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation("sampleship");
  const { t: tc } = useTranslation();
  const shipmentQuery = useShipmentQuery(id);
  const sign = useSignShipmentMutation();
  const [sending, setSending] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { leaf, group } = leafByPermission("sampleship.shipment.view");

  if (shipmentQuery.isLoading) return <LoadingState />;
  if (shipmentQuery.error || !shipmentQuery.data)
    return <ErrorState error={shipmentQuery.error ?? new Error(tc("STERR"))} />;
  const s = shipmentQuery.data;
  const order = ["DRAFT", "SENT", "SIGNED"];
  const at = order.indexOf(s.status);
  const stateOf = (index: number): TimelineStep["state"] =>
    index < at || s.status === "SIGNED" ? "done" : index === at ? "current" : "pending";
  const steps: TimelineStep[] = [
    { key: "DRAFT", title: t("STEP_DRAFT"), state: stateOf(0), description: formatDate(s.createdAt, true) },
    {
      key: "SENT",
      title: t("STEP_SENT"),
      state: stateOf(1),
      description: s.sentAt
        ? `${formatDate(s.sentAt, true)} · ${[s.courier, s.trackingNo].filter(Boolean).join(" ")}`
        : t("STEP_SENT_HINT"),
    },
    {
      key: "SIGNED",
      title: t("STEP_SIGNED"),
      state: stateOf(2),
      description: s.signedAt ? formatDate(s.signedAt, true) : t("STEP_SIGNED_HINT"),
    },
  ];

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code="sampleship.shipment.edit">
            {s.status === "DRAFT" ? <Button onClick={() => setSending(true)}>{t("SEND")}</Button> : null}
            {s.status === "SENT" ? <Button onClick={() => setSigning(true)}>{t("SIGN")}</Button> : null}
          </RequirePermission>
        }
        crumbs={[
          { label: pickLabel(group.label, i18n.language) },
          { label: pickLabel(leaf.label, i18n.language), to: "/sample-shipments" },
          { label: s.docNo },
        ]}
        title={t("DETAIL_TITLE")}
      />
      {error ? (
        <p className="rounded-md bg-danger/10 px-4 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <DetailHeaderCard
        fields={[
          { label: t("DOC_NO"), value: s.docNo },
          { label: t("CUSTOMER"), value: s.customerName },
          { label: t("METHOD"), value: s.method === "COURIER" ? t("METHOD_COURIER") : t("METHOD_FORWARDER") },
          { label: t("COURIER"), value: s.courier },
          { label: t("TRACKING_NO"), value: s.trackingNo },
          { label: t("SENT_AT"), value: s.sentAt ? formatDate(s.sentAt, true) : null },
          { label: t("SIGNED_AT"), value: s.signedAt ? formatDate(s.signedAt, true) : null },
          { label: t("OWNER"), value: s.ownerName },
          {
            label: t("RECIPIENT"),
            value: s.recipient ? `${s.recipient.company} · ${s.recipient.name}` : null,
            span: 2,
          },
          { label: t("ADDRESS"), value: s.recipient?.address, span: 2 },
          { label: t("NOTE"), value: s.note, span: "full" },
        ]}
        subtitle={s.customerName}
        tags={
          <>
            <ToneBadge label={s.customerName} tone="info" />
            <StatusBadge code={s.status} machine="sampleShipment" />
          </>
        }
        title={s.docNo}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <SectionCard bodyClassName="p-0" title={t("ITEMS")}>
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="h-10 px-4 text-left font-medium">{t("STYLE")}</th>
                <th className="px-4 text-left font-medium">{t("KIND")}</th>
                <th className="px-4 text-right font-medium">{t("QUANTITY")}</th>
              </tr>
            </thead>
            <tbody>
              {s.items.map((item, index) => (
                <tr className="border-t border-border" key={`${item.styleId}-${index}`}>
                  <td className="tabular px-4 py-2.5 font-medium">#{item.styleNo}</td>
                  <td className="px-4 py-2.5">{item.kind}</td>
                  <td className="tabular px-4 py-2.5 text-right">{item.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
        <SectionCard title={t("PROGRESS")}>
          <ProgressTimeline steps={steps} />
        </SectionCard>
      </div>
      <SendDialog open={sending} shipment={s} onOpenChange={setSending} />
      <ConfirmDialog
        description={t("SIGN_CONFIRM", { docNo: s.docNo })}
        isProcessing={sign.isPending}
        open={signing}
        title={t("SIGN")}
        onConfirm={async () => {
          setError(null);
          try {
            await sign.mutateAsync({ id: s.id, version: s.version });
            setSigning(false);
          } catch (err) {
            setError(err instanceof Error ? err.message : tc("BIZERR"));
          }
        }}
        onOpenChange={setSigning}
      />
    </section>
  );
}
