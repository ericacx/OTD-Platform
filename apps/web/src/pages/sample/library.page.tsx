import { LIBRARY_KINDS } from "@otd/contracts/sample";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";

import { RequirePermission } from "@/app/router/guards";
import { ToneBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { LendDialog, LibraryFormDialog } from "@/features/sample/components/library-dialogs";
import { useLibraryActionMutation } from "@/features/sample/sample.mutations";
import { useLibraryQuery } from "@/features/sample/sample.queries";
import { formatDate } from "@/lib/date";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { LibraryItemDto } from "@/features/sample/sample.types";
import type { ColumnDef } from "@tanstack/react-table";

const SELECT = "h-9 rounded-md border border-input bg-card px-2 text-sm";

export function LibraryPage() {
  const { t } = useTranslation("sample");
  const { t: tc } = useTranslation();
  const query = useTableQueryState();
  const library = useLibraryQuery(query.params);
  const lookups = useLookups();
  const action = useLibraryActionMutation();
  const [creating, setCreating] = useState(false);
  const [lending, setLending] = useState<LibraryItemDto | null>(null);

  const columns = useMemo<ColumnDef<LibraryItemDto, unknown>[]>(
    () => [
      {
        id: "style",
        header: t("F_STYLE"),
        cell: ({ row }) => (
          <div className="leading-tight">
            <div className="font-semibold">#{row.original.styleNo}</div>
            <div className="text-xs text-muted-foreground">{row.original.styleNameZh}</div>
          </div>
        ),
      },
      { id: "customer", header: t("COL_CUSTOMER"), cell: ({ row }) => row.original.customerName },
      {
        id: "kind",
        header: t("LIB_KIND"),
        cell: ({ row }) => (
          <ToneBadge label={t(`KIND_${row.original.kind}`)} tone={row.original.kind === "QRS" ? "success" : "info"} />
        ),
      },
      {
        id: "source",
        header: t("LIB_SOURCE"),
        cell: ({ row }) =>
          row.original.sampleId ? (
            <div className="leading-tight">
              <Link
                className="tabular whitespace-nowrap text-primary hover:underline"
                to={`/samples/${row.original.sampleId}`}
              >
                {row.original.sampleDocNo}
              </Link>
              <div className="text-xs text-muted-foreground">{row.original.roundLabel ?? ""}</div>
            </div>
          ) : (
            "—"
          ),
      },
      { id: "location", header: t("LIB_LOCATION"), cell: ({ row }) => row.original.location ?? "—" },
      {
        id: "qty",
        header: t("F_QTY"),
        meta: { align: "right" },
        cell: ({ row }) => <span className="tabular">{row.original.quantity}</span>,
      },
      {
        id: "status",
        header: t("COL_STATUS"),
        cell: ({ row }) =>
          row.original.status === "LENT" ? (
            <ToneBadge label={t("LIB_LENT_TO", { name: row.original.borrower ?? "" })} tone="warning" />
          ) : (
            <ToneBadge label={t("LIB_IN_STOCK")} tone="success" />
          ),
      },
      {
        id: "time",
        header: t("LIB_TIME"),
        cell: ({ row }) => <span className="tabular text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
      },
      {
        id: "actions",
        header: tc("TBL_ACTIONS"),
        cell: ({ row }) => (
          <RequirePermission code="sample.library.edit">
            {row.original.status === "IN_STOCK" ? (
              <Button className="h-auto px-1" variant="link" onClick={() => setLending(row.original)}>
                {t("LIB_LEND")}
              </Button>
            ) : (
              <Button
                className="h-auto px-1"
                variant="link"
                onClick={() =>
                  void action
                    .mutateAsync({ id: row.original.id, action: "return", input: { version: row.original.version } })
                    .then(() => toast.success(t("LIB_RETURNED_OK")))
                    .catch((err: unknown) => toast.error(err instanceof Error ? err.message : tc("BIZERR")))
                }
              >
                {t("LIB_RETURN")}
              </Button>
            )}
          </RequirePermission>
        ),
      },
    ],
    [t, tc, action],
  );

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code="sample.library.edit">
            <Button onClick={() => setCreating(true)}>{t("LIB_NEW")}</Button>
          </RequirePermission>
        }
        title={t("LIBRARY_PAGE_TITLE")}
      />
      <ServerDataTable
        columns={columns}
        error={library.error}
        getRowId={(row) => row.id}
        isLoading={library.isLoading}
        page={library.data}
        query={query}
        searchPlaceholder={t("LIB_SEARCH")}
        toolbar={
          <>
            <select
              aria-label={t("LIB_KIND")}
              className={SELECT}
              value={query.filters.kind ?? ""}
              onChange={(e) => query.setFilter("kind", e.target.value || undefined)}
            >
              <option value="">{t("ALL_KINDS")}</option>
              {LIBRARY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`KIND_${k}`)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("COL_STATUS")}
              className={SELECT}
              value={query.filters.status ?? ""}
              onChange={(e) => query.setFilter("status", e.target.value || undefined)}
            >
              <option value="">{t("ALL_STATUS")}</option>
              <option value="IN_STOCK">{t("LIB_IN_STOCK")}</option>
              <option value="LENT">{t("LIB_LENT")}</option>
            </select>
            <select
              aria-label={t("COL_CUSTOMER")}
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
          </>
        }
      />
      <LibraryFormDialog open={creating} onOpenChange={setCreating} />
      <LendDialog item={lending} onOpenChange={(open) => !open && setLending(null)} />
    </section>
  );
}
