import { STATUS_MACHINES, pickLabel } from "@otd/shared";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { RequirePermission } from "@/app/router/guards";
import { DocNoLink } from "@/components/biz/doc-no-link";
import { StatusBadge, ToneBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { QuoteFormDialog } from "@/features/quote/components/quote-form-dialog";
import { pct, usd, yuan } from "@/features/quote/quote.format";
import { useQuotesQuery } from "@/features/quote/quote.queries";
import { formatDate } from "@/lib/date";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { QuoteListItemDto } from "@/features/quote/quote.types";
import type { ColumnDef } from "@tanstack/react-table";

const SELECT = "h-9 rounded-md border border-input bg-card px-2 text-sm";

export function QuotesPage() {
  const { t, i18n } = useTranslation("quote");
  const navigate = useNavigate();
  const query = useTableQueryState();
  const quotes = useQuotesQuery(query.params);
  const lookups = useLookups();
  const [creating, setCreating] = useState(false);
  const statuses = Object.entries(STATUS_MACHINES.quoteRound.statuses);

  const columns = useMemo<ColumnDef<QuoteListItemDto, unknown>[]>(
    () => [
      {
        id: "docNo",
        header: t("COL_QUOTE"),
        cell: ({ row }) => (
          <DocNoLink no={row.original.latestDocNo ?? `QT-${row.original.styleNo}`} to={`/quotes/${row.original.id}`} />
        ),
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
      { id: "season", header: t("SEASON"), cell: ({ row }) => row.original.seasonCode ?? "—" },
      {
        id: "round",
        header: t("ROUND"),
        cell: ({ row }) => (row.original.latestSeq ? t("ROUND_N", { n: row.original.latestSeq }) : "—"),
      },
      {
        id: "price",
        header: t("LATEST_PRICE"),
        meta: { align: "right" },
        cell: ({ row }) =>
          row.original.latestPriceUsd !== null ? (
            <span className="tabular leading-tight">
              <span className="block font-semibold">{usd(row.original.latestPriceUsd)}</span>
              <span className="block text-xs text-muted-foreground">¥{yuan(row.original.latestPriceCny)}</span>
            </span>
          ) : (
            "—"
          ),
      },
      {
        id: "qty",
        header: t("QUANTITY"),
        meta: { align: "right" },
        cell: ({ row }) => <span className="tabular">{row.original.latestQuantity?.toLocaleString() ?? "—"}</span>,
      },
      ...(quotes.data?.items.some((item) => item.latestMargin !== undefined)
        ? [
            {
              id: "margin",
              header: t("MARGIN"),
              meta: { align: "right" as const },
              cell: ({ row }: { row: { original: QuoteListItemDto } }) => (
                <span className="tabular">{pct(row.original.latestMargin)}</span>
              ),
            },
          ]
        : []),
      {
        id: "status",
        header: t("STATUS"),
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-1">
            <StatusBadge code={row.original.status} machine="quoteRound" />
            {row.original.strategyCode ? <ToneBadge label={row.original.strategyCode} tone="neutral" /> : null}
            {row.original.archivedAt ? <ToneBadge label={t("ARCHIVED")} tone="neutral" /> : null}
          </span>
        ),
      },
      { accessorKey: "ownerName", header: t("OWNER") },
      {
        id: "date",
        header: t("DATE"),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">
            {formatDate(row.original.latestQuotedAt ?? row.original.updatedAt)}
          </span>
        ),
      },
    ],
    [t, quotes.data],
  );

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code="quote.quote.create">
            <Button onClick={() => setCreating(true)}>{t("QUOTE_NEW")}</Button>
          </RequirePermission>
        }
        title={t("QUOTES_TITLE")}
      />
      <ServerDataTable
        columns={columns}
        error={quotes.error}
        getRowId={(row) => row.id}
        isLoading={quotes.isLoading}
        page={quotes.data}
        query={query}
        searchPlaceholder={t("QUOTE_SEARCH")}
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
              {statuses.map(([code, def]) => (
                <option key={code} value={code}>
                  {pickLabel(def.label, i18n.language)}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <input
                checked={query.filters.archived === "true"}
                type="checkbox"
                onChange={(e) => query.setFilter("archived", e.target.checked ? "true" : undefined)}
              />
              {t("SHOW_ARCHIVED")}
            </label>
          </>
        }
        onRowClick={(row) => void navigate(`/quotes/${row.id}`)}
      />
      <QuoteFormDialog
        open={creating}
        quote={null}
        onOpenChange={setCreating}
        onSaved={(quote) => void navigate(`/quotes/${quote.id}`)}
      />
    </section>
  );
}
