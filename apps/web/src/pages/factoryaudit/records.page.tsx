import { AUDIT_TYPES } from "@otd/contracts/factoryaudit";
import { pickLabel } from "@otd/shared";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useHasPermission } from "@/app/providers/auth-provider";
import { StatusBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { AuditResultBadge, AuditTypeBadge } from "@/features/factoryaudit/components/audit-badges";
import { AuditDetailSheet } from "@/features/factoryaudit/components/audit-detail-sheet";
import { useAuditRecordsQuery } from "@/features/factoryaudit/factoryaudit.queries";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { formatDate } from "@/lib/date";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { AuditType, FactoryAuditDto } from "@/features/factoryaudit/factoryaudit.types";
import type { ColumnDef } from "@tanstack/react-table";

const TYPES = Object.keys(AUDIT_TYPES) as AuditType[];

export function AuditRecordsPage() {
  const { t, i18n } = useTranslation("factoryaudit");
  const { t: tc } = useTranslation();
  const query = useTableQueryState();
  const records = useAuditRecordsQuery(query.params);
  const lookups = useLookups();
  const [detailId, setDetailId] = useState<string | null>(null);
  const can = {
    recordEdit: useHasPermission("factoryaudit.record.edit"),
    findingEdit: useHasPermission("factoryaudit.finding.edit"),
  };

  const columns = useMemo<ColumnDef<FactoryAuditDto, unknown>[]>(
    () => [
      {
        accessorKey: "docNo",
        header: t("DOC_NO"),
        cell: ({ row }) => (
          <Button
            className="tabular h-auto px-0 font-semibold"
            variant="link"
            onClick={() => setDetailId(row.original.id)}
          >
            {row.original.docNo}
          </Button>
        ),
      },
      {
        accessorKey: "factoryName",
        header: t("FACTORY"),
        cell: ({ row }) => (
          <span className="leading-tight">
            <span className="block font-medium">{row.original.factoryName}</span>
            <span className="block text-xs text-muted-foreground">{row.original.baseName}</span>
          </span>
        ),
      },
      {
        accessorKey: "auditType",
        header: t("AUDIT_TYPE"),
        cell: ({ row }) => <AuditTypeBadge type={row.original.auditType} />,
      },
      { accessorKey: "customerName", header: t("CUSTOMER") },
      { accessorKey: "actualDate", header: t("ACTUAL_DATE"), cell: ({ row }) => formatDate(row.original.actualDate) },
      {
        accessorKey: "result",
        header: t("RESULT"),
        cell: ({ row }) => <AuditResultBadge result={row.original.result} />,
      },
      {
        accessorKey: "score",
        header: t("SCORE"),
        meta: { align: "right" },
        cell: ({ row }) => <span className="tabular">{row.original.score ?? "—"}</span>,
      },
      {
        accessorKey: "certificateValidUntil",
        header: t("CERT_UNTIL"),
        cell: ({ row }) => formatDate(row.original.certificateValidUntil),
      },
      {
        id: "findings",
        header: t("FINDINGS"),
        cell: ({ row }) =>
          row.original.findingCount ? (
            <Link
              className="text-sm text-primary hover:underline"
              to={`/factory-audits/findings?auditId=${row.original.id}`}
            >
              {t("FINDINGS_SUMMARY", {
                open: row.original.openFindingCount,
                overdue: row.original.overdueFindingCount,
              })}
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "status",
        header: t("STATUS"),
        cell: ({ row }) => <StatusBadge code={row.original.status} machine="factoryAudit" />,
      },
      {
        id: "actions",
        header: tc("TBL_ACTIONS"),
        cell: ({ row }) => (
          <Button className="h-auto px-1" variant="link" onClick={() => setDetailId(row.original.id)}>
            {t("DETAIL_TITLE")}
          </Button>
        ),
      },
    ],
    [t, tc],
  );

  return (
    <section className="space-y-5">
      <PageHeader title={t("RECORDS_TITLE")} />
      <ServerDataTable
        columns={columns}
        error={records.error}
        getRowId={(row) => row.id}
        isLoading={records.isLoading}
        page={records.data}
        query={query}
        searchPlaceholder={t("SEARCH_AUDIT")}
        toolbar={
          <>
            <select
              aria-label={t("AUDIT_TYPE")}
              className="h-9 rounded-md border border-input bg-card px-2 text-sm"
              value={query.filters.auditType ?? ""}
              onChange={(event) => query.setFilter("auditType", event.target.value || undefined)}
            >
              <option value="">{t("ALL_TYPES")}</option>
              {TYPES.map((type) => (
                <option key={type} value={type}>
                  {pickLabel(AUDIT_TYPES[type], i18n.language)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("FACTORY")}
              className="h-9 rounded-md border border-input bg-card px-2 text-sm"
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
          </>
        }
      />
      <AuditDetailSheet auditId={detailId} can={can} onClose={() => setDetailId(null)} />
    </section>
  );
}
