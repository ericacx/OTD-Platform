import { NODE_STATES, pickLabel, statusCodes, statusLabel } from "@otd/shared";
import { Plus, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import { RequirePermission } from "@/app/router/guards";
import { DocNoLink } from "@/components/biz/doc-no-link";
import { Money } from "@/components/biz/money";
import { StatusBadge, ToneBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { CreateOrderDialog } from "@/features/order/components/order-form-dialog";
import { UploadPoDialog } from "@/features/order/components/upload-po-dialog";
import { useOrdersQuery } from "@/features/order/order.queries";
import { formatNumber } from "@/lib/format";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";
import { cn } from "@/lib/utils";

import type { OrderListItem } from "@/features/order/order.types";
import type { ColumnDef } from "@tanstack/react-table";

const STATUSES = statusCodes("order");
const SELECT = "h-9 rounded-md border border-input bg-card px-2 text-sm";

export function OrderListPage() {
  const { t, i18n } = useTranslation("order");
  const { t: tc } = useTranslation();
  const lang = i18n.language;
  const query = useTableQueryState();
  const orders = useOrdersQuery(query.params);
  const lookups = useLookups();
  const navigate = useNavigate();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const selectedStatuses = useMemo(
    () => (query.filters.status ? query.filters.status.split(",") : []),
    [query.filters.status],
  );

  const columns = useMemo<ColumnDef<OrderListItem, unknown>[]>(
    () => [
      {
        accessorKey: "poNo",
        header: t("COL_PO"),
        meta: { sortKey: "poNo" },
        cell: ({ row }) => (
          <span className="flex flex-col">
            <DocNoLink no={row.original.poNo} to={`/orders/${row.original.id}`} />
            {row.original.revision > 1 ? (
              <span className="text-xs text-muted-foreground">{t("REV", { n: row.original.revision })}</span>
            ) : null}
          </span>
        ),
      },
      {
        accessorKey: "customerName",
        header: t("COL_CUSTOMER"),
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.customerName}</span>,
      },
      { accessorKey: "seasonCode", header: t("COL_SEASON"), cell: ({ row }) => row.original.seasonCode ?? "—" },
      {
        id: "styles",
        header: t("COL_STYLES"),
        cell: ({ row }) => {
          const nos = row.original.styleNos;
          if (!nos.length) return "—";
          return (
            <span className="whitespace-nowrap">
              {nos.length > 1
                ? t("STYLE_MORE", { first: nos[0], count: nos.length, rest: nos.length - 1 })
                : `#${nos[0]}`}
            </span>
          );
        },
      },
      {
        accessorKey: "totalPairs",
        header: t("COL_PAIRS"),
        meta: { sortKey: "totalPairs", align: "right" },
        cell: ({ row }) => <span className="tabular">{formatNumber(row.original.totalPairs, 0, lang)}</span>,
      },
      {
        accessorKey: "fobAmount",
        header: t("COL_AMOUNT"),
        meta: { align: "right" },
        cell: ({ row }) => <Money amount={row.original.fobAmount} currency={row.original.currency} />,
      },
      {
        accessorKey: "customerDueDate",
        header: t("COL_DUE"),
        meta: { sortKey: "customerDueDate" },
        cell: ({ row }) => <span className="tabular whitespace-nowrap">{row.original.customerDueDate}</span>,
      },
      {
        accessorKey: "factoryReplyDate",
        header: t("COL_REPLY"),
        cell: ({ row }) => {
          const delay = row.original.delayDays ?? 0;
          return (
            <span className={cn("tabular whitespace-nowrap", delay > 0 && "text-danger")}>
              {row.original.factoryReplyDate ?? "—"}
              {delay > 0 ? ` (+${delay})` : ""}
            </span>
          );
        },
      },
      { accessorKey: "factoryName", header: t("COL_FACTORY"), cell: ({ row }) => row.original.factoryName ?? "—" },
      {
        accessorKey: "merchandiserName",
        header: t("COL_MERCH"),
        cell: ({ row }) => row.original.merchandiserName ?? "—",
      },
      {
        accessorKey: "status",
        header: t("COL_STATUS"),
        cell: ({ row }) => <StatusBadge code={row.original.status} machine="order" />,
      },
      {
        id: "node",
        header: t("COL_NODE"),
        cell: ({ row }) => {
          const node = row.original.currentNode;
          if (!node) return "—";
          const def = NODE_STATES[node.state as keyof typeof NODE_STATES];
          return <ToneBadge label={`${node.code} ${pickLabel(node.name, lang)}`} tone={def?.tone ?? "neutral"} />;
        },
      },
      {
        id: "actions",
        header: tc("TBL_ACTIONS"),
        cell: ({ row }) => (
          <span className="flex gap-3 whitespace-nowrap text-sm">
            <Link
              className="font-medium text-primary hover:underline"
              to={`/orders/monitor?poNo=${encodeURIComponent(row.original.poNo)}`}
            >
              {t("ACT_MONITOR")}
            </Link>
          </span>
        ),
      },
    ],
    [t, tc, lang],
  );

  function toggleStatus(code: string) {
    const next = selectedStatuses.includes(code)
      ? selectedStatuses.filter((s) => s !== code)
      : [...selectedStatuses, code];
    query.setFilter("status", next.length ? next.join(",") : undefined);
  }

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code="order.order.create">
            <Button variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden="true" className="size-4" />
              {t("BTN_CREATE")}
            </Button>
            <Button onClick={() => setUploadOpen(true)}>
              <Upload aria-hidden="true" className="size-4" />
              {t("UPLOAD_PO")}
            </Button>
          </RequirePermission>
        }
        title={t("LIST_TITLE")}
      />
      <div aria-label={t("STATUS_FILTER")} className="flex flex-wrap gap-2" role="group">
        {STATUSES.map((code) => {
          const active = selectedStatuses.includes(code);
          return (
            <button
              aria-pressed={active}
              className={cn(
                "h-8 rounded-full border px-3 text-sm transition-colors",
                active
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border bg-card hover:border-primary/40",
              )}
              key={code}
              type="button"
              onClick={() => toggleStatus(code)}
            >
              {pickLabel(statusLabel("order", code), lang)}
            </button>
          );
        })}
        <button
          aria-pressed={Boolean(query.filters.risk)}
          className={cn(
            "h-8 rounded-full border px-3 text-sm transition-colors",
            query.filters.risk
              ? "border-danger bg-danger/10 text-danger"
              : "border-border bg-card hover:border-danger/40",
          )}
          type="button"
          onClick={() => query.setFilter("risk", query.filters.risk ? undefined : "1")}
        >
          {t("RISK_ONLY")}
        </button>
      </div>
      <ServerDataTable
        columns={columns}
        error={orders.error}
        getRowId={(row) => row.id}
        isLoading={orders.isLoading}
        page={orders.data}
        query={query}
        searchPlaceholder={t("SEARCH_PH")}
        toolbar={
          <>
            <select
              aria-label={t("COL_CUSTOMER")}
              className={SELECT}
              value={query.filters.customerId ?? ""}
              onChange={(event) => query.setFilter("customerId", event.target.value || undefined)}
            >
              <option value="">{t("ALL_CUSTOMERS")}</option>
              {(lookups.data?.customers ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {pickLabel({ zh: c.name, en: c.nameEn ?? c.name }, lang)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("COL_FACTORY")}
              className={SELECT}
              value={query.filters.factoryId ?? ""}
              onChange={(event) => query.setFilter("factoryId", event.target.value || undefined)}
            >
              <option value="">{t("ALL_FACTORIES")}</option>
              {(lookups.data?.factories ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <input
              aria-label={t("DUE_FROM")}
              className={SELECT}
              title={t("DUE_FROM")}
              type="date"
              value={query.filters.dueFrom ?? ""}
              onChange={(event) => query.setFilter("dueFrom", event.target.value || undefined)}
            />
            <input
              aria-label={t("DUE_TO")}
              className={SELECT}
              title={t("DUE_TO")}
              type="date"
              value={query.filters.dueTo ?? ""}
              onChange={(event) => query.setFilter("dueTo", event.target.value || undefined)}
            />
          </>
        }
      />
      <UploadPoDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      <CreateOrderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(order) => {
          void navigate(`/orders/${order.id}`);
        }}
      />
    </section>
  );
}
