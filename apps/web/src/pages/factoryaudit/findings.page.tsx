import { FINDING_STATUSES } from "@otd/contracts/factoryaudit";
import { SEVERITIES, pickLabel, type Severity } from "@otd/shared";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useHasPermission } from "@/app/providers/auth-provider";
import { RequirePermission } from "@/app/router/guards";
import { PrimaryTag } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { FindingStatusBadge, SeverityBadge } from "@/features/factoryaudit/components/audit-badges";
import { AuditDetailSheet } from "@/features/factoryaudit/components/audit-detail-sheet";
import { CloseFindingDialog } from "@/features/factoryaudit/components/close-finding-dialog";
import { FindingFormDialog, type FindingFormTarget } from "@/features/factoryaudit/components/finding-form-dialog";
import { useFindingsQuery } from "@/features/factoryaudit/factoryaudit.queries";
import { formatDate } from "@/lib/date";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { FindingDto } from "@/features/factoryaudit/factoryaudit.types";
import type { ColumnDef } from "@tanstack/react-table";

const LEVELS = Object.keys(SEVERITIES) as Severity[];
const STATUSES = Object.keys(FINDING_STATUSES) as (keyof typeof FINDING_STATUSES)[];

export function FindingsPage() {
  const { t, i18n } = useTranslation("factoryaudit");
  const { t: tc } = useTranslation();
  const query = useTableQueryState();
  const findings = useFindingsQuery(query.params);
  const [detailId, setDetailId] = useState<string | null>(null);
  const can = {
    recordEdit: useHasPermission("factoryaudit.record.edit"),
    findingEdit: useHasPermission("factoryaudit.finding.edit"),
  };
  const [target, setTarget] = useState<FindingFormTarget | null>(null);
  const [closing, setClosing] = useState<FindingDto | null>(null);
  const auditFilter = query.filters.auditId;
  const auditDocNo = auditFilter ? findings.data?.items.find((f) => f.auditId === auditFilter)?.auditDocNo : undefined;

  const columns = useMemo<ColumnDef<FindingDto, unknown>[]>(
    () => [
      {
        accessorKey: "item",
        header: t("ITEM"),
        cell: ({ row }) => (
          <span className="leading-tight">
            <span className="block font-medium">{row.original.item}</span>
            <span className="block text-xs text-muted-foreground">{row.original.correctiveAction ?? ""}</span>
          </span>
        ),
      },
      {
        accessorKey: "auditDocNo",
        header: t("DOC_NO"),
        cell: ({ row }) => (
          <Button
            className="tabular h-auto px-0 font-semibold"
            variant="link"
            onClick={() => setDetailId(row.original.auditId)}
          >
            {row.original.auditDocNo}
          </Button>
        ),
      },
      {
        accessorKey: "factoryName",
        header: t("FACTORY"),
        cell: ({ row }) => (
          <span className="leading-tight">
            <span className="block">{row.original.factoryName}</span>
            <span className="block text-xs text-muted-foreground">{row.original.customerName}</span>
          </span>
        ),
      },
      {
        accessorKey: "severity",
        header: t("SEVERITY"),
        cell: ({ row }) => <SeverityBadge severity={row.original.severity} />,
      },
      { accessorKey: "responsible", header: t("RESPONSIBLE"), cell: ({ row }) => row.original.responsible ?? "—" },
      {
        accessorKey: "dueDate",
        header: t("DUE_DATE"),
        cell: ({ row }) => (
          <span className="leading-tight">
            <span className="tabular block">{formatDate(row.original.dueDate)}</span>
            {row.original.overdue ? (
              <span className="block text-xs text-danger">{t("OVERDUE_DAYS", { days: row.original.overdueDays })}</span>
            ) : null}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: t("FINDING_STATUS"),
        cell: ({ row }) => <FindingStatusBadge finding={row.original} />,
      },
      {
        accessorKey: "closedAt",
        header: t("CLOSED_AT"),
        cell: ({ row }) => (row.original.closedAt ? formatDate(row.original.closedAt, true) : "—"),
      },
      {
        id: "actions",
        header: tc("TBL_ACTIONS"),
        cell: ({ row }) =>
          row.original.status === "OPEN" ? (
            <RequirePermission code="factoryaudit.finding.edit">
              <div className="flex gap-1 whitespace-nowrap">
                <Button
                  className="h-auto px-1"
                  variant="link"
                  onClick={() => setTarget({ kind: "edit", finding: row.original })}
                >
                  {tc("1VV96U")}
                </Button>
                <Button className="h-auto px-1" variant="link" onClick={() => setClosing(row.original)}>
                  {t("CLOSE_FINDING")}
                </Button>
              </div>
            </RequirePermission>
          ) : (
            <span className="text-xs text-muted-foreground">{row.original.closeNote ?? ""}</span>
          ),
      },
    ],
    [t, tc],
  );

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          auditFilter ? (
            <>
              {auditDocNo ? <PrimaryTag>{t("AUDIT_FILTER", { docNo: auditDocNo })}</PrimaryTag> : null}
              <Button variant="outline" onClick={() => query.setFilter("auditId", undefined)}>
                {t("CLEAR_AUDIT_FILTER")}
              </Button>
            </>
          ) : undefined
        }
        title={t("FINDINGS_TITLE")}
      />
      <ServerDataTable
        columns={columns}
        error={findings.error}
        getRowId={(row) => row.id}
        isLoading={findings.isLoading}
        page={findings.data}
        query={query}
        searchPlaceholder={t("SEARCH_FINDING")}
        toolbar={
          <>
            <select
              aria-label={t("FINDING_STATUS")}
              className="h-9 rounded-md border border-input bg-card px-2 text-sm"
              value={query.filters.status ?? ""}
              onChange={(event) => query.setFilter("status", event.target.value || undefined)}
            >
              <option value="">{t("ALL_STATUS")}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {pickLabel(FINDING_STATUSES[s], i18n.language)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("DUE_DATE")}
              className="h-9 rounded-md border border-input bg-card px-2 text-sm"
              value={query.filters.overdue ?? ""}
              onChange={(event) => query.setFilter("overdue", event.target.value || undefined)}
            >
              <option value="">{t("ALL_DUE")}</option>
              <option value="true">{t("OVERDUE_ONLY")}</option>
              <option value="false">{t("NOT_OVERDUE")}</option>
            </select>
            <select
              aria-label={t("SEVERITY")}
              className="h-9 rounded-md border border-input bg-card px-2 text-sm"
              value={query.filters.severity ?? ""}
              onChange={(event) => query.setFilter("severity", event.target.value || undefined)}
            >
              <option value="">{t("ALL_SEVERITY")}</option>
              {LEVELS.map((s) => (
                <option key={s} value={s}>
                  {pickLabel(SEVERITIES[s].label, i18n.language)}
                </option>
              ))}
            </select>
          </>
        }
      />
      <FindingFormDialog target={target} onClose={() => setTarget(null)} />
      <CloseFindingDialog finding={closing} onClose={() => setClosing(null)} />
      <AuditDetailSheet auditId={detailId} can={can} onClose={() => setDetailId(null)} />
    </section>
  );
}
