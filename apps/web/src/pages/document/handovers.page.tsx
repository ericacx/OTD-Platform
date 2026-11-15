import { STATUS_MACHINES, pickLabel } from "@otd/shared";
import { CheckCheck, Clock, FolderCheck, Layers } from "lucide-react";
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
import { HandoverCreateDialog } from "@/features/document/components/handover-create-dialog";
import { useHandoversQuery } from "@/features/document/document.queries";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { formatDate } from "@/lib/date";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";
import { cn } from "@/lib/utils";

import type { HandoverDto } from "@/features/document/document.types";
import type { ColumnDef } from "@tanstack/react-table";

const SELECT = "h-9 rounded-md border border-input bg-card px-2 text-sm";
const STALE_DAYS = 7;

function Dots({ handover }: { handover: HandoverDto }) {
  return (
    <span aria-hidden="true" className="flex gap-1">
      {handover.checklist.map((c) => (
        <span
          className={cn(
            "size-2 rounded-full",
            !c.applicable ? "bg-muted-foreground/30" : c.ok ? "bg-success" : "bg-danger",
          )}
          key={c.key}
        />
      ))}
    </span>
  );
}

export function HandoversPage() {
  const { t, i18n } = useTranslation("document");
  const navigate = useNavigate();
  const query = useTableQueryState();
  const handovers = useHandoversQuery(query.params);
  const collecting = useHandoversQuery({ status: "COLLECTING", pageSize: 200 });
  const handed = useHandoversQuery({ status: "HANDED_OVER", pageSize: 1 });
  const lookups = useLookups();
  const [creating, setCreating] = useState(false);
  const open = collecting.data?.items ?? [];

  const columns = useMemo<ColumnDef<HandoverDto, unknown>[]>(
    () => [
      {
        id: "docNo",
        header: t("DOC_NO"),
        cell: ({ row }) => <DocNoLink no={row.original.docNo} to={`/documents/handovers/${row.original.id}`} />,
      },
      {
        id: "style",
        header: t("STYLE"),
        cell: ({ row }) => (
          <span className="leading-tight">
            <span className="tabular block font-medium">#{row.original.styleNo}</span>
            <span className="block max-w-56 truncate text-xs text-muted-foreground">{row.original.styleName}</span>
          </span>
        ),
      },
      { accessorKey: "customerName", header: t("CUSTOMER") },
      {
        id: "progress",
        header: t("PROGRESS"),
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <Dots handover={row.original} />
            <span className="tabular text-xs text-muted-foreground">
              {row.original.okCount} / {row.original.applicableCount}
            </span>
          </span>
        ),
      },
      {
        id: "missing",
        header: t("MISSING_ITEMS"),
        cell: ({ row }) =>
          row.original.status === "HANDED_OVER" ? (
            <span className="text-muted-foreground">—</span>
          ) : row.original.missing.length ? (
            <span className="text-sm text-danger">{row.original.missing.join("、")}</span>
          ) : (
            <span className="text-sm text-success">{t("READY")}</span>
          ),
      },
      {
        id: "status",
        header: t("STATUS"),
        cell: ({ row }) => <StatusBadge code={row.original.status} machine="handover" />,
      },
      {
        id: "days",
        header: t("COLLECTING_DAYS"),
        meta: { align: "right" },
        cell: ({ row }) => (
          <span
            className={cn(
              "tabular",
              row.original.status === "COLLECTING" &&
                row.original.collectingDays > STALE_DAYS &&
                "font-medium text-danger",
            )}
          >
            {t("DAYS", { count: row.original.collectingDays })}
          </span>
        ),
      },
      { accessorKey: "ownerName", header: t("OWNER") },
      {
        id: "updated",
        header: t("UPDATED"),
        cell: ({ row }) => <span className="tabular text-muted-foreground">{formatDate(row.original.updatedAt)}</span>,
      },
    ],
    [t],
  );

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code="document.handover.edit">
            <Button onClick={() => setCreating(true)}>{t("HANDOVER_NEW")}</Button>
          </RequirePermission>
        }
        description={t("HANDOVERS_DESC")}
        title={t("HANDOVERS_TITLE")}
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          icon={Layers}
          label={t("KPI_COLLECTING")}
          tone="primary"
          unit={t("UNIT")}
          value={collecting.data?.total ?? "—"}
        />
        <KpiCard
          icon={CheckCheck}
          label={t("KPI_READY")}
          tone="success"
          unit={t("UNIT")}
          value={collecting.data ? open.filter((h) => h.ready).length : "—"}
        />
        <KpiCard
          hint={t("KPI_STALE_HINT", { days: STALE_DAYS })}
          icon={Clock}
          label={t("KPI_STALE")}
          tone="danger"
          unit={t("UNIT")}
          value={collecting.data ? open.filter((h) => h.collectingDays > STALE_DAYS).length : "—"}
        />
        <KpiCard icon={FolderCheck} label={t("KPI_HANDED")} unit={t("UNIT")} value={handed.data?.total ?? "—"} />
      </div>
      <ServerDataTable
        columns={columns}
        error={handovers.error}
        getRowId={(row) => row.id}
        isLoading={handovers.isLoading}
        page={handovers.data}
        query={query}
        searchPlaceholder={t("HANDOVER_SEARCH")}
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
              {Object.entries(STATUS_MACHINES.handover.statuses).map(([code, def]) => (
                <option key={code} value={code}>
                  {pickLabel(def.label, i18n.language)}
                </option>
              ))}
            </select>
          </>
        }
        onRowClick={(row) => void navigate(`/documents/handovers/${row.id}`)}
      />
      <HandoverCreateDialog
        open={creating}
        onCreated={(h) => void navigate(`/documents/handovers/${h.id}`)}
        onOpenChange={setCreating}
      />
    </section>
  );
}
