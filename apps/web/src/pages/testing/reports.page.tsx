import { AlarmClock, CircleCheck, CircleX, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { RequirePermission } from "@/app/router/guards";
import { KpiCard } from "@/components/biz/kpi-card";
import { StatusBadge, ToneBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { ReportEditDialog } from "@/features/testing/components/test-action-dialogs";
import { useItemLabels } from "@/features/testing/labels";
import { useReportsQuery } from "@/features/testing/testing.queries";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";
import { cn } from "@/lib/utils";

import type { TestReportDto } from "@/features/testing/testing.types";
import type { ColumnDef } from "@tanstack/react-table";

const SELECT = "h-9 rounded-md border border-input bg-card px-2 text-sm";

export function ReportsPage() {
  const { t } = useTranslation("testing");
  const { t: tc } = useTranslation();
  const query = useTableQueryState();
  const reports = useReportsQuery(query.params);
  const valid = useReportsQuery({ status: "VALID", pageSize: 1 });
  const expiring = useReportsQuery({ status: "EXPIRING", pageSize: 5 });
  const expired = useReportsQuery({ status: "EXPIRED", pageSize: 5 });
  const failed = useReportsQuery({ result: "FAIL", pageSize: 1 });
  const lookups = useLookups();
  const items = useItemLabels();
  const [editing, setEditing] = useState<TestReportDto | null>(null);

  const columns = useMemo<ColumnDef<TestReportDto, unknown>[]>(
    () => [
      {
        id: "docNo",
        header: t("R_DOC_NO"),
        cell: ({ row }) => <span className="tabular font-semibold whitespace-nowrap">{row.original.docNo}</span>,
      },
      {
        id: "agencyNo",
        header: t("F_AGENCY_REPORT_NO"),
        cell: ({ row }) => <span className="tabular whitespace-nowrap">{row.original.agencyReportNo}</span>,
      },
      {
        id: "agency",
        header: t("F_AGENCY"),
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.agencyName ?? "—"}</span>,
      },
      {
        id: "styles",
        header: t("R_SCOPE"),
        cell: ({ row }) => (
          <div className="leading-tight">
            <div className="font-medium">
              {row.original.linkedStyles.map((s) => `#${s.styleNo}`).join("、") || `#${row.original.styleNo}`}
            </div>
            <div className="text-xs text-muted-foreground">{row.original.customerName}</div>
          </div>
        ),
      },
      {
        id: "items",
        header: t("F_ITEMS"),
        cell: ({ row }) => <span className="block max-w-[180px] truncate">{items(row.original.items)}</span>,
      },
      {
        id: "result",
        header: t("F_RESULT"),
        cell: ({ row }) => (
          <ToneBadge
            label={row.original.result === "PASS" ? t("RESULT_PASS") : t("RESULT_FAIL")}
            tone={row.original.result === "PASS" ? "success" : "danger"}
          />
        ),
      },
      {
        id: "issued",
        header: t("F_ISSUED"),
        cell: ({ row }) => <span className="tabular whitespace-nowrap">{row.original.issuedDate}</span>,
      },
      {
        id: "valid",
        header: t("F_VALID_UNTIL"),
        cell: ({ row }) => (
          <div className="tabular leading-tight whitespace-nowrap">
            <div>{row.original.validUntil}</div>
            <div className={cn("text-xs", row.original.daysToExpire < 0 ? "text-danger" : "text-muted-foreground")}>
              {row.original.daysToExpire < 0
                ? t("EXPIRED_DAYS", { days: -row.original.daysToExpire })
                : t("EXPIRE_IN_DAYS", { days: row.original.daysToExpire })}
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: t("COL_STATUS"),
        cell: ({ row }) => <StatusBadge code={row.original.status} machine="testReport" />,
      },
      {
        id: "source",
        header: t("R_SOURCE"),
        cell: ({ row }) =>
          row.original.testRequestId ? (
            <Link
              className="tabular whitespace-nowrap text-primary hover:underline"
              to={`/tests/${row.original.testRequestId}`}
            >
              {row.original.testRequestDocNo}
            </Link>
          ) : (
            "—"
          ),
      },
      {
        id: "file",
        header: t("R_FILE"),
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{row.original.fileId ? t("R_FILE_YES") : t("R_FILE_NO")}</span>
        ),
      },
      {
        id: "actions",
        header: tc("TBL_ACTIONS"),
        cell: ({ row }) => (
          <RequirePermission code="testing.report.edit">
            <Button className="h-auto px-1" variant="link" onClick={() => setEditing(row.original)}>
              {t("R_EDIT")}
            </Button>
          </RequirePermission>
        ),
      },
    ],
    [t, tc, items],
  );

  return (
    <section className="space-y-5">
      <PageHeader title={t("REPORTS_TITLE")} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={CircleCheck} label={t("KPI_VALID")} tone="success" value={valid.data?.total ?? "—"} />
        <KpiCard
          hint={(expiring.data?.items ?? []).map((x) => x.agencyReportNo).join("、") || undefined}
          icon={AlarmClock}
          label={t("KPI_EXPIRING")}
          tone="warning"
          value={expiring.data?.total ?? "—"}
        />
        <KpiCard
          hint={(expired.data?.items ?? []).map((x) => x.agencyReportNo).join("、") || undefined}
          icon={ShieldAlert}
          label={t("KPI_EXPIRED")}
          tone="danger"
          value={expired.data?.total ?? "—"}
        />
        <KpiCard icon={CircleX} label={t("KPI_FAILED")} value={failed.data?.total ?? "—"} />
      </div>
      <ServerDataTable
        columns={columns}
        error={reports.error}
        getRowId={(row) => row.id}
        isLoading={reports.isLoading}
        page={reports.data}
        query={query}
        searchPlaceholder={t("R_SEARCH")}
        toolbar={
          <>
            <select
              aria-label={t("COL_STATUS")}
              className={SELECT}
              value={query.filters.status ?? ""}
              onChange={(e) => query.setFilter("status", e.target.value || undefined)}
            >
              <option value="">{t("R_ALL_STATUS")}</option>
              <option value="VALID">{t("R_ST_VALID")}</option>
              <option value="EXPIRING">{t("R_ST_EXPIRING")}</option>
              <option value="EXPIRED">{t("R_ST_EXPIRED")}</option>
            </select>
            <select
              aria-label={t("F_RESULT")}
              className={SELECT}
              value={query.filters.result ?? ""}
              onChange={(e) => query.setFilter("result", e.target.value || undefined)}
            >
              <option value="">{t("ALL_RESULTS")}</option>
              <option value="PASS">{t("RESULT_PASS")}</option>
              <option value="FAIL">{t("RESULT_FAIL")}</option>
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
      <ReportEditDialog report={editing} onOpenChange={(open) => !open && setEditing(null)} />
    </section>
  );
}
