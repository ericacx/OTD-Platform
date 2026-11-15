import { STATUS_MACHINES, pickLabel } from "@otd/shared";
import { CheckCheck, FilePen, Send } from "lucide-react";
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
import { ShipmentCreateDialog } from "@/features/sampleship/components/shipment-create-dialog";
import { useShipmentsQuery } from "@/features/sampleship/sampleship.queries";
import { formatDate } from "@/lib/date";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { SampleShipmentDto } from "@/features/sampleship/sampleship.types";
import type { ColumnDef } from "@tanstack/react-table";

const SELECT = "h-9 rounded-md border border-input bg-card px-2 text-sm";

export function ShipmentsPage() {
  const { t, i18n } = useTranslation("sampleship");
  const navigate = useNavigate();
  const query = useTableQueryState();
  const shipments = useShipmentsQuery(query.params);
  const drafts = useShipmentsQuery({ status: "DRAFT", pageSize: 1 });
  const sent = useShipmentsQuery({ status: "SENT", pageSize: 1 });
  const signed = useShipmentsQuery({ status: "SIGNED", pageSize: 1 });
  const lookups = useLookups();
  const [creating, setCreating] = useState(false);

  const columns = useMemo<ColumnDef<SampleShipmentDto, unknown>[]>(
    () => [
      {
        id: "docNo",
        header: t("DOC_NO"),
        cell: ({ row }) => <DocNoLink no={row.original.docNo} to={`/sample-shipments/${row.original.id}`} />,
      },
      { accessorKey: "customerName", header: t("CUSTOMER") },
      {
        id: "recipient",
        header: t("RECIPIENT"),
        cell: ({ row }) =>
          row.original.recipient ? (
            <span className="leading-tight">
              <span className="block">{row.original.recipient.company}</span>
              <span className="block text-xs text-muted-foreground">{row.original.recipient.name}</span>
            </span>
          ) : (
            "—"
          ),
      },
      {
        id: "method",
        header: t("METHOD"),
        cell: ({ row }) => (row.original.method === "COURIER" ? t("METHOD_COURIER") : t("METHOD_FORWARDER")),
      },
      {
        id: "tracking",
        header: t("TRACKING_NO"),
        cell: ({ row }) => (
          <span className="tabular">
            {[row.original.courier, row.original.trackingNo].filter(Boolean).join(" · ") || "—"}
          </span>
        ),
      },
      {
        id: "items",
        header: t("ITEMS"),
        cell: ({ row }) => (
          <span className="block max-w-64 truncate">
            {row.original.items.map((item) => `#${item.styleNo} ${item.kind} × ${item.quantity}`).join("，")}
          </span>
        ),
      },
      {
        id: "status",
        header: t("STATUS"),
        cell: ({ row }) => <StatusBadge code={row.original.status} machine="sampleShipment" />,
      },
      {
        id: "sentAt",
        header: t("SENT_AT"),
        cell: ({ row }) => <span className="tabular text-muted-foreground">{formatDate(row.original.sentAt)}</span>,
      },
      {
        id: "signedAt",
        header: t("SIGNED_AT"),
        cell: ({ row }) => <span className="tabular text-muted-foreground">{formatDate(row.original.signedAt)}</span>,
      },
      { accessorKey: "ownerName", header: t("OWNER") },
    ],
    [t],
  );

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code="sampleship.shipment.create">
            <Button onClick={() => setCreating(true)}>{t("SHIPMENT_NEW")}</Button>
          </RequirePermission>
        }
        title={t("SHIPMENTS_TITLE")}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard icon={FilePen} label={t("KPI_DRAFT")} unit={t("UNIT")} value={drafts.data?.total ?? "—"} />
        <KpiCard icon={Send} label={t("KPI_SENT")} tone="info" unit={t("UNIT")} value={sent.data?.total ?? "—"} />
        <KpiCard
          icon={CheckCheck}
          label={t("KPI_SIGNED")}
          tone="success"
          unit={t("UNIT")}
          value={signed.data?.total ?? "—"}
        />
      </div>
      <ServerDataTable
        columns={columns}
        error={shipments.error}
        getRowId={(row) => row.id}
        isLoading={shipments.isLoading}
        page={shipments.data}
        query={query}
        searchPlaceholder={t("SEARCH")}
        toolbar={
          <>
            <select
              aria-label={t("CUSTOMER")}
              className={SELECT}
              value={query.filters.customerId ?? ""}
              onChange={(e) => query.setFilter("customerId", e.target.value || undefined)}
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
              onChange={(e) => query.setFilter("status", e.target.value || undefined)}
            >
              <option value="">{t("ALL_STATUSES")}</option>
              {Object.entries(STATUS_MACHINES.sampleShipment.statuses).map(([code, def]) => (
                <option key={code} value={code}>
                  {pickLabel(def.label, i18n.language)}
                </option>
              ))}
            </select>
          </>
        }
        onRowClick={(row) => void navigate(`/sample-shipments/${row.id}`)}
      />
      <ShipmentCreateDialog
        open={creating}
        onCreated={(s) => void navigate(`/sample-shipments/${s.id}`)}
        onOpenChange={setCreating}
      />
    </section>
  );
}
