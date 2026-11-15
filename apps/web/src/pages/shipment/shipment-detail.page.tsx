import { SHIPMENT_STATUSES } from "@otd/contracts/shipment";
import { pickLabel, statusLabel, type DocType } from "@otd/shared";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { RequirePermission } from "@/app/router/guards";
import { DetailHeaderCard, SectionCard } from "@/components/biz/detail-header-card";
import { DocNoLink } from "@/components/biz/doc-no-link";
import { ProgressTimeline, type TimelineStep } from "@/components/biz/progress-timeline";
import { PrimaryTag, StatusBadge, ToneBadge } from "@/components/biz/status-badge";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { leafByPermission, leafPath } from "@/components/common/placeholder-page";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { BookingViewDialog } from "@/features/shipment/components/booking-dialogs";
import { AdvanceDialog, nextAdvance, SignDialog } from "@/features/shipment/components/shipment-action-dialogs";
import { useTransportLabel } from "@/features/shipment/shipment.labels";
import { useShipmentQuery } from "@/features/shipment/shipment.queries";
import { formatDate } from "@/lib/date";
import { formatNumber } from "@/lib/format";
import { usePublishPageDoc } from "@/stores/page-doc.store";

import type { ShipmentDetailDto, ShipmentDto } from "@otd/contracts/shipment";
import type { ColumnDef } from "@tanstack/react-table";
import type { TFunction } from "i18next";

function steps(d: ShipmentDetailDto, t: TFunction<"shipment">, locale: string): TimelineStep[] {
  const reached = SHIPMENT_STATUSES.indexOf(d.status);
  const desc: Record<string, string> = {
    BOOKED: [d.carrierText, d.blNo ? t("BL_SHORT", { no: d.blNo }) : null].filter(Boolean).join(" ｜ "),
    PACKED: t("PACKED_DESC", { lines: d.cartonLines, cartons: formatNumber(d.cartonCount) }),
    SAILED: "",
    ARRIVED: "",
    SIGNED: [t("DESTINATION"), d.destination].filter(Boolean).join(" "),
  };
  return SHIPMENT_STATUSES.map((status, index) => {
    const event = d.events.find((e) => e.status === status);
    const plan = event?.plannedAt ? t("PLAN_ON", { date: event.plannedAt }) : null;
    const actual = event?.actualAt ? t("ACTUAL_ON", { date: formatDate(event.actualAt, true) }) : null;
    const gated = status === "PACKED" && !d.released && reached < index;
    const state: TimelineStep["state"] =
      index <= reached ? "done" : index === reached + 1 ? (gated ? "blocked" : "current") : "pending";
    return {
      key: status,
      title: pickLabel(statusLabel("shipment", status), locale),
      state,
      ...(status === "PACKED" ? { gate: true } : {}),
      description: [desc[status], plan, actual, gated ? t("GATE_BLOCKED_HINT") : null].filter(Boolean).join(" ｜ "),
      ...(event?.note && status !== "BOOKED" ? { meta: event.note } : {}),
    };
  });
}

export function ShipmentDetailPage() {
  const { id = "" } = useParams();
  const { t, i18n } = useTranslation("shipment");
  const detail = useShipmentQuery(id);
  usePublishPageDoc(
    detail.data ? { docType: "shipment" satisfies DocType, docId: detail.data.id, docNo: detail.data.docNo } : null,
  );
  const transportLabel = useTransportLabel();
  const [action, setAction] = useState<"advance" | "sign" | null>(null);
  const [viewBooking, setViewBooking] = useState<string | null>(null);
  const { group, leaf } = leafByPermission("shipment.shipment.view");

  const batchColumns = useMemo<ColumnDef<ShipmentDto, unknown>[]>(
    () => [
      {
        id: "docNo",
        header: t("SHIPMENT_NO"),
        cell: ({ row }) =>
          row.original.id === id ? (
            <DocNoLink no={row.original.docNo} />
          ) : (
            <DocNoLink no={row.original.docNo} to={`/shipments/${row.original.id}`} />
          ),
      },
      { id: "booking", header: t("BOOKING_NO"), cell: ({ row }) => row.original.bookingNo ?? "—" },
      {
        id: "mode",
        header: t("TRANSPORT"),
        cell: ({ row }) =>
          [transportLabel(row.original.transportMode), row.original.destination].filter(Boolean).join(" · "),
      },
      { id: "etd", header: "ETD", cell: ({ row }) => formatDate(row.original.etd) },
      { id: "eta", header: "ETA", cell: ({ row }) => formatDate(row.original.eta) },
      { id: "cartons", header: t("CARTONS"), cell: ({ row }) => formatNumber(row.original.cartonCount) },
      {
        id: "status",
        header: t("STATUS"),
        cell: ({ row }) => <StatusBadge code={row.original.status} machine="shipment" />,
      },
    ],
    [t, id, transportLabel],
  );

  if (detail.isLoading) return <LoadingState />;
  if (detail.error || !detail.data) return <ErrorState error={detail.error} />;
  const d = detail.data;
  const next = nextAdvance(d.status);

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <>
            {d.inspectionId ? (
              <Button asChild variant="outline">
                <Link to={`/inspections/${d.inspectionId}`}>
                  <ArrowLeft aria-hidden="true" className="size-4" />
                  {t("BACK_TO", { no: d.inspectionNo })}
                </Link>
              </Button>
            ) : null}
            <Button disabled={!d.bookingId} variant="outline" onClick={() => setViewBooking(d.bookingId)}>
              {t("VIEW_BOOKING")}
            </Button>
            <Button asChild variant="outline">
              <Link to={`/${leafPath("packaging.carton.view")}?orderId=${d.orderId}`}>{t("VIEW_CARTONS")}</Link>
            </Button>
            {next ? (
              <RequirePermission code="shipment.shipment.advance">
                <Button variant="outline" onClick={() => setAction("advance")}>
                  {t("ADVANCE_TO", { status: pickLabel(statusLabel("shipment", next), i18n.language) })}
                </Button>
              </RequirePermission>
            ) : null}
            <RequirePermission code="shipment.shipment.sign">
              <Button disabled={d.status !== "ARRIVED"} onClick={() => setAction("sign")}>
                {t("SIGN")}
              </Button>
            </RequirePermission>
          </>
        }
        crumbs={[
          { label: pickLabel(group.label, i18n.language) },
          { label: pickLabel(leaf.label, i18n.language), to: "/shipments" },
          { label: d.docNo },
        ]}
        title={t("DETAIL_TITLE")}
      />
      <DetailHeaderCard
        fields={[
          { label: t("SHIPMENT_NO"), value: <span className="tabular">{d.docNo}</span> },
          { label: t("BOOKING_NO"), value: d.bookingNo },
          { label: t("CUSTOMER"), value: d.customerName },
          { label: t("PO"), value: <span className="tabular">{d.poNo}</span> },
          { label: t("STYLE"), value: d.styleNo ? `#${d.styleNo}` : null },
          { label: t("STYLE_NAME"), value: d.styleName },
          {
            label: t("TRANSPORT"),
            value: [transportLabel(d.transportMode), d.destination].filter(Boolean).join(" · "),
          },
          { label: t("CARRIER_TEXT"), value: d.carrierText },
          { label: t("BL_NO"), value: d.blNo },
          { label: "ETD", value: formatDate(d.etd) },
          { label: "ETA", value: formatDate(d.eta) },
          { label: t("DESTINATION"), value: d.destination },
          {
            label: t("CARTONS"),
            value: d.cartonCount != null ? t("CARTONS_N", { n: formatNumber(d.cartonCount) }) : null,
          },
          { label: t("PAIRS"), value: d.pairs != null ? t("PAIRS_N", { n: formatNumber(d.pairs) }) : null },
          { label: t("GROSS_WEIGHT"), value: d.grossWeight != null ? `${formatNumber(d.grossWeight, 1)} kg` : null },
          { label: t("VOLUME"), value: d.volume != null ? `${formatNumber(d.volume, 2)} CBM` : null },
          { label: t("FACTORY"), value: d.factoryName },
          { label: t("SEASON"), value: d.seasonCode },
          {
            label: t("G2"),
            value: d.released ? (
              <ToneBadge label={t("G2_RELEASED")} tone="success" />
            ) : (
              <ToneBadge label={t("G2_NOT_RELEASED")} tone="danger" />
            ),
          },
          {
            label: t("RECEIVABLE"),
            value: d.receivable ? <DocNoLink no={d.receivable.docNo} to={`/receivables/${d.receivable.id}`} /> : null,
          },
        ]}
        showImage
        subtitle={[
          d.poNo,
          [transportLabel(d.transportMode), d.destination].filter(Boolean).join(" · "),
          d.carrierText,
          d.blNo,
        ]
          .filter(Boolean)
          .join(" ｜ ")}
        tags={
          <>
            <ToneBadge label={d.customerName} tone="info" />
            <StatusBadge code={d.status} machine="shipment" />
            {d.seasonCode ? <PrimaryTag>{d.seasonCode}</PrimaryTag> : null}
            <PrimaryTag>{transportLabel(d.transportMode)}</PrimaryTag>
          </>
        }
        title={`${d.docNo}${d.styleNo ? ` · #${d.styleNo}` : ""}${d.styleNameEn ? ` ${d.styleNameEn}` : ""}`}
      />
      <SectionCard title={t("PROGRESS_CARD")}>
        <ProgressTimeline steps={steps(d, t, i18n.language)} />
      </SectionCard>
      <SectionCard bodyClassName="p-0" title={t("BATCHES_CARD")}>
        <DataTable columns={batchColumns} data={d.batches} getRowId={(r) => r.id} />
      </SectionCard>
      {action === "advance" ? <AdvanceDialog shipment={d} onClose={() => setAction(null)} /> : null}
      {action === "sign" ? <SignDialog shipment={d} onClose={() => setAction(null)} /> : null}
      <BookingViewDialog bookingId={viewBooking} onClose={() => setViewBooking(null)} />
    </section>
  );
}
