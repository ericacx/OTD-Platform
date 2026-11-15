import { BOOKING_STATUSES } from "@otd/contracts/shipment";
import { pickLabel, statusLabel } from "@otd/shared";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { RequirePermission } from "@/app/router/guards";
import { DocNoLink } from "@/components/biz/doc-no-link";
import { StatusBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { useLookups } from "@/features/masterdata/lookups.queries";
import {
  BookingCancelDialog,
  BookingConfirmDialog,
  BookingFormDialog,
  BookingViewDialog,
} from "@/features/shipment/components/booking-dialogs";
import { useTransportLabel } from "@/features/shipment/shipment.labels";
import { useBookingsQuery } from "@/features/shipment/shipment.queries";
import { formatDate } from "@/lib/date";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { BookingDto } from "@otd/contracts/shipment";
import type { ColumnDef } from "@tanstack/react-table";

const SELECT = "h-9 rounded-md border border-input bg-card px-2 text-sm";

export function BookingsPage() {
  const { t, i18n } = useTranslation("shipment");
  const { t: tc } = useTranslation();
  const query = useTableQueryState();
  const list = useBookingsQuery(query.params);
  const lookups = useLookups();
  const transportLabel = useTransportLabel();
  const [form, setForm] = useState<BookingDto | null | undefined>(undefined);
  const [confirming, setConfirming] = useState<BookingDto | null>(null);
  const [cancelling, setCancelling] = useState<BookingDto | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const columns = useMemo<ColumnDef<BookingDto, unknown>[]>(
    () => [
      {
        accessorKey: "docNo",
        header: t("BOOKING_NO"),
        meta: { sortKey: "docNo" },
        cell: ({ row }) => (
          <button className="text-left" type="button" onClick={() => setViewing(row.original.id)}>
            <DocNoLink className="text-primary hover:underline" no={row.original.docNo} />
          </button>
        ),
      },
      { id: "po", header: t("PO"), cell: ({ row }) => <span className="tabular">{row.original.poNo}</span> },
      { accessorKey: "customerName", header: t("CUSTOMER") },
      { id: "forwarder", header: t("FORWARDER"), cell: ({ row }) => row.original.forwarderName ?? "—" },
      { id: "carrier", header: t("CARRIER"), cell: ({ row }) => row.original.carrier ?? "—" },
      { id: "mode", header: t("TRANSPORT"), cell: ({ row }) => transportLabel(row.original.transportMode) },
      {
        id: "vessel",
        header: t("VESSEL_VOYAGE"),
        cell: ({ row }) => [row.original.vessel, row.original.voyage].filter(Boolean).join(" / ") || "—",
      },
      { id: "bl", header: t("BL_NO"), cell: ({ row }) => <span className="tabular">{row.original.blNo ?? "—"}</span> },
      { id: "cutoff", header: t("CUTOFF"), cell: ({ row }) => formatDate(row.original.cutoffDate) },
      {
        id: "etd",
        header: "ETD",
        meta: { sortKey: "etd" },
        cell: ({ row }) => <span className="tabular">{formatDate(row.original.etd)}</span>,
      },
      { id: "eta", header: "ETA", cell: ({ row }) => <span className="tabular">{formatDate(row.original.eta)}</span> },
      { id: "container", header: t("CONTAINER"), cell: ({ row }) => row.original.containerType ?? "—" },
      {
        id: "count",
        header: t("SHIPMENT_COUNT"),
        meta: { align: "right" },
        cell: ({ row }) => row.original.shipmentCount,
      },
      {
        id: "status",
        header: t("STATUS"),
        cell: ({ row }) => <StatusBadge code={row.original.status} machine="booking" />,
      },
      {
        id: "actions",
        header: tc("TBL_ACTIONS"),
        cell: ({ row }) =>
          row.original.status === "CANCELLED" ? (
            <span className="text-xs text-muted-foreground">{row.original.cancelReason ?? ""}</span>
          ) : (
            <RequirePermission code="shipment.booking.edit">
              <div className="flex gap-1 whitespace-nowrap">
                <Button className="h-auto px-1" variant="link" onClick={() => setForm(row.original)}>
                  {tc("1VV96U")}
                </Button>
                {row.original.status === "PENDING_CARRIER" ? (
                  <Button className="h-auto px-1" variant="link" onClick={() => setConfirming(row.original)}>
                    {t("CONFIRM")}
                  </Button>
                ) : null}
                <Button className="h-auto px-1 text-danger" variant="link" onClick={() => setCancelling(row.original)}>
                  {t("CANCEL_BOOKING")}
                </Button>
              </div>
            </RequirePermission>
          ),
      },
    ],
    [t, tc, transportLabel],
  );

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code="shipment.booking.edit">
            <Button onClick={() => setForm(null)}>{t("BOOKING_NEW")}</Button>
          </RequirePermission>
        }
        description={t("BOOKINGS_DESC")}
        title={t("BOOKINGS_TITLE")}
      />
      <ServerDataTable
        columns={columns}
        error={list.error}
        getRowId={(row) => row.id}
        isLoading={list.isLoading}
        page={list.data}
        query={query}
        searchPlaceholder={t("BOOKING_SEARCH")}
        toolbar={
          <>
            <select
              aria-label={t("CUSTOMER")}
              className={SELECT}
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
            <select
              aria-label={t("STATUS")}
              className={SELECT}
              value={query.filters.status ?? ""}
              onChange={(event) => query.setFilter("status", event.target.value || undefined)}
            >
              <option value="">{t("ALL_STATUS")}</option>
              {BOOKING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {pickLabel(statusLabel("booking", s), i18n.language)}
                </option>
              ))}
            </select>
          </>
        }
      />
      <BookingFormDialog
        booking={form ?? null}
        open={form !== undefined}
        onOpenChange={(open) => !open && setForm(undefined)}
      />
      <BookingConfirmDialog booking={confirming} onClose={() => setConfirming(null)} />
      <BookingCancelDialog booking={cancelling} onClose={() => setCancelling(null)} />
      <BookingViewDialog bookingId={viewing} onClose={() => setViewing(null)} />
    </section>
  );
}
