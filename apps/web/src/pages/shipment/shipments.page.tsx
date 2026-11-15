import { SHIPMENT_STATUSES, TRANSPORT_MODES } from "@otd/contracts/shipment";
import { pickLabel, statusLabel } from "@otd/shared";
import { Anchor, Boxes, Ship, Timer } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { RequirePermission } from "@/app/router/guards";
import { DocNoLink } from "@/components/biz/doc-no-link";
import { KpiCard } from "@/components/biz/kpi-card";
import { StatusBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { ShipmentCreateDialog } from "@/features/shipment/components/shipment-create-dialog";
import { useTransportLabel } from "@/features/shipment/shipment.labels";
import { useShipmentKpisQuery, useShipmentsQuery } from "@/features/shipment/shipment.queries";
import { formatDate } from "@/lib/date";
import { formatNumber } from "@/lib/format";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { ShipmentDto } from "@otd/contracts/shipment";
import type { ColumnDef } from "@tanstack/react-table";

const SELECT = "h-9 rounded-md border border-input bg-card px-2 text-sm";

export function ShipmentsPage() {
  const { t, i18n } = useTranslation("shipment");
  const navigate = useNavigate();
  const query = useTableQueryState();
  const list = useShipmentsQuery(query.params);
  const kpis = useShipmentKpisQuery();
  const lookups = useLookups();
  const transportLabel = useTransportLabel();
  const [creating, setCreating] = useState(false);

  const columns = useMemo<ColumnDef<ShipmentDto, unknown>[]>(
    () => [
      {
        accessorKey: "docNo",
        header: t("SHIPMENT_NO"),
        meta: { sortKey: "docNo" },
        cell: ({ row }) => <DocNoLink no={row.original.docNo} to={`/shipments/${row.original.id}`} />,
      },
      {
        id: "booking",
        meta: { className: "whitespace-nowrap" },
        header: t("BOOKING_NO"),
        cell: ({ row }) => <span className="tabular">{row.original.bookingNo ?? "—"}</span>,
      },
      { accessorKey: "customerName", header: t("CUSTOMER"), meta: { className: "whitespace-nowrap" } },
      { id: "po", header: t("PO"), cell: ({ row }) => <span className="tabular">{row.original.poNo}</span> },
      {
        id: "style",
        header: t("STYLE"),
        cell: ({ row }) =>
          row.original.styleNo ? (
            <div className="leading-tight">
              <div className="font-medium">#{row.original.styleNo}</div>
              <div className="text-xs text-muted-foreground">{row.original.styleName}</div>
            </div>
          ) : (
            "—"
          ),
      },
      {
        id: "mode",
        header: t("TRANSPORT"),
        meta: { className: "whitespace-nowrap" },
        cell: ({ row }) => transportLabel(row.original.transportMode),
      },
      { id: "dest", header: t("DESTINATION"), cell: ({ row }) => row.original.destination ?? "—" },
      {
        id: "etd",
        header: "ETD",
        meta: { sortKey: "etd", className: "whitespace-nowrap" },
        cell: ({ row }) => <span className="tabular">{formatDate(row.original.etd)}</span>,
      },
      {
        id: "eta",
        header: "ETA",
        meta: { sortKey: "eta", className: "whitespace-nowrap" },
        cell: ({ row }) => <span className="tabular">{formatDate(row.original.eta)}</span>,
      },
      {
        id: "cartons",
        header: t("CARTONS"),
        meta: { align: "right" },
        cell: ({ row }) => <span className="tabular">{formatNumber(row.original.cartonCount)}</span>,
      },
      {
        id: "status",
        header: t("STATUS"),
        cell: ({ row }) => <StatusBadge code={row.original.status} machine="shipment" />,
      },
    ],
    [t, transportLabel],
  );

  const k = kpis.data;
  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code="shipment.shipment.create">
            <Button onClick={() => setCreating(true)}>{t("CREATE")}</Button>
          </RequirePermission>
        }
        title={t("LIST_TITLE")}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          hint={t("KPI_IN_TRANSIT_HINT")}
          icon={Ship}
          label={t("KPI_IN_TRANSIT")}
          to="/shipments?status=SAILED"
          value={k?.inTransit ?? "—"}
        />
        <KpiCard
          hint={t("KPI_ARRIVED_HINT")}
          icon={Anchor}
          label={t("KPI_ARRIVED")}
          to="/shipments?arrivedNotSigned=true"
          tone="warning"
          value={k?.arrived ?? "—"}
        />
        <KpiCard
          hint={t("KPI_UNCONFIRMED_HINT")}
          icon={Timer}
          label={t("KPI_UNCONFIRMED")}
          to="/shipments/bookings?status=PENDING_CARRIER"
          tone="danger"
          value={k?.unconfirmedBookings ?? "—"}
        />
        <KpiCard
          hint={t("KPI_CARTONS_HINT")}
          icon={Boxes}
          label={t("KPI_CARTONS")}
          value={k ? formatNumber(k.cartonsThisMonth) : "—"}
        />
      </div>
      <ServerDataTable
        columns={columns}
        error={list.error}
        getRowId={(row) => row.id}
        isLoading={list.isLoading}
        page={list.data}
        query={query}
        searchPlaceholder={t("SEARCH")}
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
              {SHIPMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {pickLabel(statusLabel("shipment", s), i18n.language)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("TRANSPORT")}
              className={SELECT}
              value={query.filters.transportMode ?? ""}
              onChange={(event) => query.setFilter("transportMode", event.target.value || undefined)}
            >
              <option value="">{t("ALL_MODES")}</option>
              {TRANSPORT_MODES.map((m) => (
                <option key={m} value={m}>
                  {transportLabel(m)}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                checked={query.filters.arrivedNotSigned === "true"}
                type="checkbox"
                onChange={(event) => query.setFilter("arrivedNotSigned", event.target.checked ? "true" : undefined)}
              />
              {t("ARRIVED_NOT_SIGNED")}
            </label>
          </>
        }
        onRowClick={(row) => void navigate(`/shipments/${row.id}`)}
      />
      <ShipmentCreateDialog
        open={creating}
        onCreated={(row) => void navigate(`/shipments/${row.id}`)}
        onOpenChange={setCreating}
      />
    </section>
  );
}
