import { TEST_REQUEST_STATUSES } from "@otd/contracts/testing";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { RequirePermission } from "@/app/router/guards";
import { StatusBadge, ToneBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { NewTestDialog } from "@/features/testing/components/new-test-dialog";
import { useItemLabels } from "@/features/testing/labels";
import { useTestRequestsQuery } from "@/features/testing/testing.queries";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { TestRequestDto } from "@/features/testing/testing.types";
import type { ColumnDef } from "@tanstack/react-table";

const SELECT = "h-9 rounded-md border border-input bg-card px-2 text-sm";

export function TestsPage() {
  const { t } = useTranslation("testing");
  const { t: tc } = useTranslation();
  const query = useTableQueryState();
  const tests = useTestRequestsQuery(query.params);
  const lookups = useLookups();
  const items = useItemLabels();
  const [creating, setCreating] = useState(false);

  const columns = useMemo<ColumnDef<TestRequestDto, unknown>[]>(
    () => [
      {
        id: "no",
        header: t("COL_NO"),
        cell: ({ row }) => (
          <Link
            className="tabular font-semibold whitespace-nowrap text-primary hover:underline"
            to={`/tests/${row.original.id}`}
          >
            {row.original.docNo}
          </Link>
        ),
      },
      {
        id: "customer",
        header: t("COL_CUSTOMER"),
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.customerName}</span>,
      },
      {
        id: "po",
        header: t("F_PO"),
        cell: ({ row }) => <span className="tabular">{row.original.customerPo ?? "—"}</span>,
      },
      {
        id: "style",
        header: t("COL_STYLE"),
        cell: ({ row }) => (
          <div className="leading-tight">
            <div className="font-medium">#{row.original.styleNo}</div>
            <div className="max-w-[200px] truncate text-xs text-muted-foreground">{row.original.styleNameZh}</div>
          </div>
        ),
      },
      { id: "stage", header: t("F_STAGE"), cell: ({ row }) => t(`STAGE_${row.original.stage}`) },
      {
        id: "agency",
        header: t("F_AGENCY"),
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.agencyName ?? "—"}</span>,
      },
      {
        id: "items",
        header: t("F_ITEMS"),
        cell: ({ row }) => <span className="block max-w-[180px] truncate">{items(row.original.items)}</span>,
      },
      {
        id: "dates",
        header: t("COL_DATES"),
        cell: ({ row }) => (
          <div className="tabular leading-tight whitespace-nowrap">
            <div>{row.original.sentDate ?? "—"}</div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {row.original.completedDate ?? row.original.dueDate ?? "—"}
              {row.original.overdue ? <ToneBadge label={t("OVERDUE")} tone="danger" /> : null}
            </div>
          </div>
        ),
      },
      {
        id: "result",
        header: t("F_RESULT"),
        cell: ({ row }) =>
          row.original.result ? (
            <ToneBadge
              label={row.original.result === "PASS" ? t("RESULT_PASS") : t("RESULT_FAIL")}
              tone={row.original.result === "PASS" ? "success" : "danger"}
            />
          ) : (
            "—"
          ),
      },
      {
        id: "status",
        header: t("COL_STATUS"),
        cell: ({ row }) => <StatusBadge code={row.original.status} machine="testRequest" />,
      },
      {
        id: "actions",
        header: tc("TBL_ACTIONS"),
        cell: ({ row }) => (
          <Button asChild className="h-auto px-1" variant="link">
            <Link to={`/tests/${row.original.id}`}>{t("DETAIL")}</Link>
          </Button>
        ),
      },
    ],
    [t, tc, items],
  );

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code="testing.request.create">
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" />
              {t("NEW")}
            </Button>
          </RequirePermission>
        }
        title={t("LIST_TITLE")}
      />
      <ServerDataTable
        columns={columns}
        error={tests.error}
        getRowId={(row) => row.id}
        isLoading={tests.isLoading}
        page={tests.data}
        query={query}
        searchPlaceholder={t("SEARCH")}
        toolbar={
          <>
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
            <select
              aria-label={t("COL_STATUS")}
              className={SELECT}
              value={query.filters.status ?? ""}
              onChange={(e) => query.setFilter("status", e.target.value || undefined)}
            >
              <option value="">{t("ALL_STATUS")}</option>
              {TEST_REQUEST_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`ST_${s}`)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("F_STAGE")}
              className={SELECT}
              value={query.filters.stage ?? ""}
              onChange={(e) => query.setFilter("stage", e.target.value || undefined)}
            >
              <option value="">{t("ALL_STAGES")}</option>
              <option value="DEV">{t("STAGE_DEV")}</option>
              <option value="BULK">{t("STAGE_BULK")}</option>
            </select>
          </>
        }
      />
      <NewTestDialog open={creating} onOpenChange={setCreating} />
    </section>
  );
}
