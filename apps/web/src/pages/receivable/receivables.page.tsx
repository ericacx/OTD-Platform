import { RECEIVABLE_STATUSES, type ReceivableDto } from "@otd/contracts/receivable";
import { pickLabel, statusLabel } from "@otd/shared";
import { AlarmClock, CalendarRange, CircleDollarSign, FileWarning, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { RequirePermission } from "@/app/router/guards";
import { DocNoLink } from "@/components/biz/doc-no-link";
import { KpiCard } from "@/components/biz/kpi-card";
import { StatusBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { AmountCell, OverdueCell, PaidProgress } from "@/features/receivable/components/receivable-cells";
import {
  CollectionDialog,
  OffsetDialog,
  ReceiptDialog,
  ReceivableCreateDialog,
} from "@/features/receivable/components/receivable-dialogs";
import { isOpen, useDictLabel } from "@/features/receivable/receivable.labels";
import { useReceivableKpisQuery, useReceivablesQuery } from "@/features/receivable/receivable.queries";
import { formatNumber } from "@/lib/format";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { ColumnDef } from "@tanstack/react-table";

const SELECT = "h-9 rounded-md border border-input bg-card px-2 text-sm";

export function ReceivablesPage() {
  const { t, i18n } = useTranslation("receivable");
  const { t: tc } = useTranslation();
  const query = useTableQueryState({ sort: "dueDate" });
  const list = useReceivablesQuery(query.params);
  const kpiParams = useMemo(
    () => ({
      customerId: query.filters.customerId,
      settlementEntity: query.filters.settlementEntity,
      keyword: query.keyword,
    }),
    [query.filters.customerId, query.filters.settlementEntity, query.keyword],
  );
  const kpis = useReceivableKpisQuery(kpiParams);
  const lookups = useLookups();
  const typeLabel = useDictLabel("receivableType");
  const [creating, setCreating] = useState(false);
  const [receipt, setReceipt] = useState<ReceivableDto | null>(null);
  const [collecting, setCollecting] = useState<ReceivableDto | null>(null);
  const [offsetting, setOffsetting] = useState<ReceivableDto | null>(null);

  const columns = useMemo<ColumnDef<ReceivableDto, unknown>[]>(
    () => [
      {
        id: "docNo",
        header: t("AR_NO"),
        meta: { sortKey: "docNo" },
        cell: ({ row }) => (
          <div className="leading-tight">
            <DocNoLink no={row.original.docNo} to={`/receivables/${row.original.id}`} />
            <div className="text-xs whitespace-nowrap text-muted-foreground">
              {row.original.poNo
                ? `${row.original.poNo}${row.original.shipmentNo ? ` / ${row.original.shipmentNo}` : ""}`
                : (row.original.sourceNo ?? "—")}
            </div>
          </div>
        ),
      },
      {
        id: "customer",
        header: t("CUSTOMER"),
        cell: ({ row }) => (
          <div className="leading-tight">
            <div>{row.original.customerName}</div>
            <div className="text-xs text-muted-foreground">{row.original.settlementEntity ?? "—"}</div>
          </div>
        ),
      },
      {
        id: "type",
        header: t("TYPE"),
        meta: { className: "whitespace-nowrap" },
        cell: ({ row }) => typeLabel(row.original.type),
      },
      {
        id: "amount",
        header: t("AMOUNT"),
        meta: { sortKey: "amount", align: "right" },
        cell: ({ row }) => <AmountCell ar={row.original} />,
      },
      {
        id: "dueDate",
        header: t("DUE_DATE"),
        meta: { sortKey: "dueDate", className: "whitespace-nowrap" },
        cell: ({ row }) => (
          <div className="leading-tight">
            <span className="tabular">{row.original.dueDate}</span>
            {row.original.missingData ? <div className="text-xs text-warning">{t("MISSING_DATA")}</div> : null}
          </div>
        ),
      },
      { id: "overdue", header: t("OVERDUE"), cell: ({ row }) => <OverdueCell ar={row.original} /> },
      { id: "paid", header: t("PAID_OF"), cell: ({ row }) => <PaidProgress ar={row.original} /> },
      {
        id: "status",
        header: t("STATUS"),
        cell: ({ row }) => <StatusBadge code={row.original.status} machine="receivable" />,
      },
      { accessorKey: "ownerName", header: t("OWNER") },
      {
        id: "actions",
        header: tc("TBL_ACTIONS"),
        cell: ({ row }) => {
          const ar = row.original;
          return (
            <div className="flex gap-1 whitespace-nowrap">
              {ar.overdue ? (
                <RequirePermission code="receivable.collection.log">
                  <Button className="h-auto px-1" variant="link" onClick={() => setCollecting(ar)}>
                    {t("COLLECT")}
                  </Button>
                </RequirePermission>
              ) : null}
              {isOpen(ar) && ar.amount > 0 ? (
                <RequirePermission code="receivable.receivable.receipt">
                  <Button className="h-auto px-1" variant="link" onClick={() => setReceipt(ar)}>
                    {t("RECEIPT")}
                  </Button>
                </RequirePermission>
              ) : null}
              {ar.status === "OFFSET_PENDING" ? (
                <RequirePermission code="receivable.receivable.receipt">
                  <Button className="h-auto px-1" variant="link" onClick={() => setOffsetting(ar)}>
                    {t("OFFSET")}
                  </Button>
                </RequirePermission>
              ) : null}
            </div>
          );
        },
      },
    ],
    [t, tc, typeLabel],
  );

  const k = kpis.data;
  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code="receivable.receivable.create">
            <Button onClick={() => setCreating(true)}>{t("CREATE")}</Button>
          </RequirePermission>
        }
        title={t("LEDGER_TITLE")}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          icon={CircleDollarSign}
          label={t("KPI_BALANCE")}
          tone="primary"
          value={k ? formatNumber(k.balanceUsd, 0, i18n.language) : "—"}
        />
        <KpiCard
          hint={k ? t("COUNT_N", { n: k.overdueCount }) : null}
          icon={TriangleAlert}
          label={t("KPI_OVERDUE_AMOUNT")}
          tone="danger"
          value={k ? formatNumber(k.overdueUsd, 0, i18n.language) : "—"}
        />
        <KpiCard
          hint={k ? t("AVG_OVERDUE", { n: k.avgOverdueDays }) : null}
          icon={AlarmClock}
          label={t("KPI_OVERDUE_COUNT")}
          to="/receivables?overdue=true"
          tone="danger"
          value={k?.overdueCount ?? "—"}
        />
        <KpiCard icon={CalendarRange} label={t("KPI_DUE_MONTH")} value={k?.dueThisMonth ?? "—"} />
        <KpiCard
          hint={t("KPI_MISSING_HINT")}
          icon={FileWarning}
          label={t("KPI_MISSING")}
          to="/receivables?missingData=true"
          tone="warning"
          value={k?.missingData ?? "—"}
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
              {RECEIVABLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {pickLabel(statusLabel("receivable", s), i18n.language)}
                </option>
              ))}
            </select>
            <Input
              aria-label={t("SETTLEMENT_ENTITY")}
              className="h-9 w-48"
              placeholder={t("ALL_ENTITIES")}
              value={query.filters.settlementEntity ?? ""}
              onChange={(event) => query.setFilter("settlementEntity", event.target.value || undefined)}
            />
          </>
        }
      />
      <ReceivableCreateDialog open={creating} onOpenChange={setCreating} />
      <ReceiptDialog receivable={receipt} onClose={() => setReceipt(null)} />
      <CollectionDialog receivable={collecting} onClose={() => setCollecting(null)} />
      <OffsetDialog receivable={offsetting} onClose={() => setOffsetting(null)} />
    </section>
  );
}
