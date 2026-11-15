import { COLLECTION_TABS, type ReceivableDto } from "@otd/contracts/receivable";
import { pickLabel, statusLabel } from "@otd/shared";
import { AlarmClock, CalendarCheck, HandCoins, PhoneOff, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { RequirePermission } from "@/app/router/guards";
import { SectionCard } from "@/components/biz/detail-header-card";
import { DocNoLink } from "@/components/biz/doc-no-link";
import { KpiCard } from "@/components/biz/kpi-card";
import { Money } from "@/components/biz/money";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/data-table/data-table";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { OverdueCell } from "@/features/receivable/components/receivable-cells";
import { CollectionDialog } from "@/features/receivable/components/receivable-dialogs";
import { resultLabel, useDictLabel } from "@/features/receivable/receivable.labels";
import {
  fetchCollectionRows,
  useCollectionQuery,
  useCollectionSummaryQuery,
} from "@/features/receivable/receivable.queries";
import { buildStatementCsv, downloadCsv } from "@/features/receivable/statement";
import { formatDate } from "@/lib/date";
import { formatNumber } from "@/lib/format";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";
import { cn } from "@/lib/utils";

import type { CollectionSummaryDto } from "@otd/contracts/receivable";
import type { ColumnDef } from "@tanstack/react-table";

type Tab = (typeof COLLECTION_TABS)[number];
const TAB_KEY: Record<Tab, "TAB_ALL" | "TAB_MINE" | "TAB_TODAY" | "TAB_TEAM"> = {
  all: "TAB_ALL",
  mine: "TAB_MINE",
  today: "TAB_TODAY",
  team: "TAB_TEAM",
};

export function CollectionPage() {
  const { t, i18n } = useTranslation("receivable");
  const query = useTableQueryState();
  const tab = (COLLECTION_TABS as readonly string[]).includes(query.filters.tab ?? "")
    ? (query.filters.tab as Tab)
    : "all";
  const params = useMemo(() => ({ ...query.params, tab }), [query.params, tab]);
  const list = useCollectionQuery(params);
  const summary = useCollectionSummaryQuery(query.filters.customerId);
  const lookups = useLookups();
  const typeLabel = useDictLabel("receivableType");
  const channelLabel = useDictLabel("collectionChannel");
  const [collecting, setCollecting] = useState<ReceivableDto | null>(null);
  const [exporting, setExporting] = useState(false);
  const today = formatDate(new Date());

  const columns = useMemo<ColumnDef<ReceivableDto, unknown>[]>(
    () => [
      {
        id: "docNo",
        header: t("AR_DUE"),
        cell: ({ row }) => (
          <div className="leading-tight">
            <DocNoLink no={row.original.docNo} to={`/receivables/${row.original.id}`} />
            <div className="text-xs text-muted-foreground">
              {typeLabel(row.original.type)} · {row.original.dueDate}
            </div>
          </div>
        ),
      },
      { accessorKey: "customerName", header: t("CUSTOMER") },
      { id: "overdue", header: t("OVERDUE"), cell: ({ row }) => <OverdueCell ar={row.original} /> },
      {
        id: "amount",
        header: t("AMOUNT_PAID"),
        cell: ({ row }) => (
          <div className="leading-tight">
            <Money amount={row.original.amount} className="font-semibold" currency={row.original.currency} />
            <div className="text-xs text-muted-foreground">
              {t("RECEIVED")} <Money amount={row.original.receivedAmount} currency={row.original.currency} />
            </div>
          </div>
        ),
      },
      { id: "count", header: t("CHASED"), cell: ({ row }) => t("TIMES_N", { n: row.original.collectionCount }) },
      {
        id: "last",
        header: t("LAST_ACTION"),
        cell: ({ row }) =>
          row.original.lastCollection ? (
            `${channelLabel(row.original.lastCollection.channel)} · ${resultLabel(row.original.lastCollection.result, i18n.language)}`
          ) : (
            <span className="text-warning">{t("NOT_CONTACTED")}</span>
          ),
      },
      {
        id: "next",
        header: t("NEXT_FOLLOW_UP"),
        cell: ({ row }) => (
          <span
            className={cn(
              "tabular",
              row.original.nextFollowUp && row.original.nextFollowUp <= today && "font-semibold text-danger",
            )}
          >
            {row.original.nextFollowUp ?? "—"}
          </span>
        ),
      },
      { accessorKey: "ownerName", header: t("OWNER") },
      {
        id: "actions",
        header: t("ACTIONS"),
        cell: ({ row }) => (
          <RequirePermission code="receivable.collection.log">
            <Button className="h-auto px-1" variant="link" onClick={() => setCollecting(row.original)}>
              {t("LOG_COLLECTION")}
            </Button>
          </RequirePermission>
        ),
      },
    ],
    [t, typeLabel, channelLabel, i18n.language, today],
  );

  const teamColumns = useMemo<ColumnDef<CollectionSummaryDto["team"][number], unknown>[]>(
    () => [
      { accessorKey: "ownerName", header: t("OWNER") },
      { id: "count", header: t("KPI_OVERDUE_COUNT"), cell: ({ row }) => row.original.overdueCount },
      {
        id: "usd",
        header: t("KPI_OVERDUE_AMOUNT"),
        cell: ({ row }) => formatNumber(row.original.overdueUsd, 0, i18n.language),
      },
      { id: "untouched", header: t("KPI_UNTOUCHED"), cell: ({ row }) => row.original.untouched },
    ],
    [t, i18n.language],
  );

  async function exportStatements() {
    setExporting(true);
    try {
      const rows = await fetchCollectionRows({ tab, customerId: query.filters.customerId, keyword: query.keyword });
      const csv = buildStatementCsv(rows.items, {
        headers: [
          t("CUSTOMER"),
          t("SETTLEMENT_ENTITY"),
          t("AR_NO"),
          t("TYPE"),
          t("SOURCE_NO"),
          t("CURRENCY"),
          t("AMOUNT"),
          t("RECEIVED"),
          t("OUTSTANDING"),
          t("DUE_DATE"),
          t("OVERDUE_DAYS"),
          t("STATUS"),
        ],
        subtotal: t("SUBTOTAL"),
        type: typeLabel,
        status: (code) => pickLabel(statusLabel("receivable", code), i18n.language),
      });
      downloadCsv(t("STATEMENT_FILE", { date: today }), csv);
    } finally {
      setExporting(false);
    }
  }

  const s = summary.data;
  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <Button disabled={exporting} onClick={() => void exportStatements()}>
            {t("EXPORT_STATEMENTS")}
          </Button>
        }
        title={t("COLLECTION_PAGE_TITLE")}
      />
      <div
        aria-label={t("COLLECTION_PAGE_TITLE")}
        className="flex flex-wrap gap-1 rounded-lg bg-muted p-1"
        role="tablist"
      >
        {COLLECTION_TABS.map((key) => (
          <button
            aria-selected={tab === key}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium",
              tab === key ? "bg-background text-foreground shadow" : "text-muted-foreground",
            )}
            key={key}
            role="tab"
            type="button"
            onClick={() => query.setFilter("tab", key === "all" ? undefined : key)}
          >
            {t(TAB_KEY[key])}
            <span className="tabular rounded bg-muted-foreground/10 px-1.5 text-xs">{s?.tabs[key] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          hint={s ? t("COUNT_N", { n: s.overdueCount }) : null}
          icon={TriangleAlert}
          label={t("KPI_OVERDUE_AMOUNT")}
          tone="danger"
          value={s ? formatNumber(s.overdueUsd, 0, i18n.language) : "—"}
        />
        <KpiCard
          hint={s ? t("AVG_OVERDUE", { n: s.avgOverdueDays }) : null}
          icon={AlarmClock}
          label={t("KPI_OVERDUE_COUNT")}
          value={s?.overdueCount ?? "—"}
        />
        <KpiCard
          hint={t("KPI_TODAY_HINT")}
          icon={CalendarCheck}
          label={t("KPI_TODAY")}
          tone="warning"
          value={s?.todayFollowUps ?? "—"}
        />
        <KpiCard
          hint={t("KPI_COLLECTED_HINT")}
          icon={HandCoins}
          label={t("KPI_COLLECTED")}
          tone="success"
          value={s ? formatNumber(s.collectedThisMonthUsd, 0, i18n.language) : "—"}
        />
        <KpiCard
          hint={t("KPI_UNTOUCHED_HINT")}
          icon={PhoneOff}
          label={t("KPI_UNTOUCHED")}
          tone="danger"
          value={s?.untouched ?? "—"}
        />
      </div>
      {tab === "team" && s ? (
        <SectionCard bodyClassName="p-0" title={t("TEAM_CARD")}>
          <DataTable columns={teamColumns} data={s.team} getRowId={(r) => r.ownerId} />
        </SectionCard>
      ) : null}
      <ServerDataTable
        columns={columns}
        error={list.error}
        getRowId={(row) => row.id}
        isLoading={list.isLoading}
        page={list.data}
        query={query}
        searchable={false}
        toolbar={
          <select
            aria-label={t("CUSTOMER")}
            className="h-9 rounded-md border border-input bg-card px-2 text-sm"
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
        }
      />
      <CollectionDialog receivable={collecting} onClose={() => setCollecting(null)} />
    </section>
  );
}
