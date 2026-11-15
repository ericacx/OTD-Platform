import { INSPECTION_STAGES } from "@otd/contracts/inspection";
import { pickLabel, STATUS_MACHINES } from "@otd/shared";
import { AlertTriangle, CalendarClock, ClipboardCheck, ShieldCheck } from "lucide-react";
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
import { InspectionCreateDialog } from "@/features/inspection/components/inspection-create-dialog";
import { ConclusionBadge, stageLabel } from "@/features/inspection/inspection.labels";
import { useInspectionKpisQuery, useInspectionsQuery } from "@/features/inspection/inspection.queries";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { formatDate } from "@/lib/date";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { InspectionDto } from "@otd/contracts/inspection";
import type { ColumnDef } from "@tanstack/react-table";

const SELECT = "h-9 rounded-md border border-input bg-card px-2 text-sm";

export function InspectionsPage() {
  const { t, i18n } = useTranslation("inspection");
  const navigate = useNavigate();
  const query = useTableQueryState();
  const list = useInspectionsQuery(query.params);
  const kpis = useInspectionKpisQuery();
  const lookups = useLookups();
  const [creating, setCreating] = useState(false);

  const columns = useMemo<ColumnDef<InspectionDto, unknown>[]>(
    () => [
      {
        accessorKey: "docNo",
        header: t("DOC_NO"),
        meta: { sortKey: "docNo" },
        cell: ({ row }) => <DocNoLink no={row.original.docNo} to={`/inspections/${row.original.id}`} />,
      },
      { accessorKey: "customerName", header: t("CUSTOMER"), meta: { className: "whitespace-nowrap" } },
      { accessorKey: "poNo", header: t("PO"), cell: ({ row }) => <span className="tabular">{row.original.poNo}</span> },
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
            t("STYLE_ALL")
          ),
      },
      {
        id: "stage",
        header: t("STAGE"),
        meta: { className: "whitespace-nowrap" },
        cell: ({ row }) => stageLabel(row.original.stage, i18n.language),
      },
      {
        id: "round",
        meta: { className: "whitespace-nowrap" },
        header: t("ROUND"),
        cell: ({ row }) => t("ROUND_N", { n: row.original.roundNo }),
      },
      {
        id: "dates",
        header: t("PLAN_ACTUAL"),
        meta: { sortKey: "plannedDate" },
        cell: ({ row }) => (
          <span className="tabular whitespace-nowrap">
            {formatDate(row.original.plannedDate)} / {formatDate(row.original.actualDate)}
          </span>
        ),
      },
      {
        accessorKey: "channel",
        header: t("CHANNEL"),
        meta: { className: "whitespace-nowrap" },
        cell: ({ row }) => row.original.channel ?? "—",
      },
      {
        accessorKey: "aql",
        header: t("AQL"),
        meta: { className: "whitespace-nowrap" },
        cell: ({ row }) => row.original.aql ?? "—",
      },
      { id: "result", header: t("RESULT"), cell: ({ row }) => <ConclusionBadge result={row.original.result} /> },
      {
        id: "status",
        header: t("STATUS"),
        cell: ({ row }) => <StatusBadge code={row.original.status} machine="inspection" />,
      },
    ],
    [t, i18n.language],
  );

  const k = kpis.data;
  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code="inspection.inspection.create">
            <Button onClick={() => setCreating(true)}>{t("CREATE")}</Button>
          </RequirePermission>
        }
        title={t("LIST_TITLE")}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          hint={
            k
              ? t("KPI_TOTAL_HINT", { ipi: k.byStage.IPI ?? 0, dpi: k.byStage.DPI ?? 0, fri: k.byStage.FRI ?? 0 })
              : null
          }
          icon={ClipboardCheck}
          label={t("KPI_TOTAL")}
          value={k?.total ?? "—"}
        />
        <KpiCard
          hint={t("KPI_TO_SCHEDULE_HINT")}
          icon={CalendarClock}
          label={t("KPI_TO_SCHEDULE")}
          to="/inspections?status=TO_SCHEDULE"
          tone="warning"
          value={k?.toSchedule ?? "—"}
        />
        <KpiCard
          hint={t("KPI_FAILED_HINT")}
          icon={AlertTriangle}
          label={t("KPI_FAILED")}
          to="/inspections?result=FAIL&status=INSPECTED,REWORK"
          tone="danger"
          value={k?.failed ?? "—"}
        />
        <KpiCard
          hint={t("KPI_TO_RELEASE_HINT", { released: k?.released ?? 0 })}
          icon={ShieldCheck}
          label={t("KPI_TO_RELEASE")}
          to="/inspections?stage=FRI&status=INSPECTED&result=PASS"
          tone="primary"
          value={k?.toRelease ?? "—"}
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
              aria-label={t("STAGE")}
              className={SELECT}
              value={query.filters.stage ?? ""}
              onChange={(event) => query.setFilter("stage", event.target.value || undefined)}
            >
              <option value="">{t("ALL_STAGES")}</option>
              {INSPECTION_STAGES.map((s) => (
                <option key={s} value={s}>
                  {stageLabel(s, i18n.language)}
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
              {Object.entries(STATUS_MACHINES.inspection.statuses).map(([code, def]) => (
                <option key={code} value={code}>
                  {pickLabel(def.label, i18n.language)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("RESULT")}
              className={SELECT}
              value={query.filters.result ?? ""}
              onChange={(event) => query.setFilter("result", event.target.value || undefined)}
            >
              <option value="">{t("ALL_RESULTS")}</option>
              <option value="PASS">{t("PASS")}</option>
              <option value="FAIL">{t("FAIL")}</option>
            </select>
          </>
        }
        onRowClick={(row) => void navigate(`/inspections/${row.id}`)}
      />
      <InspectionCreateDialog
        open={creating}
        onCreated={(row) => void navigate(`/inspections/${row.id}`)}
        onOpenChange={setCreating}
      />
    </section>
  );
}
