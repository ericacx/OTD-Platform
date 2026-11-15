import { AUDIT_TYPES } from "@otd/contracts/factoryaudit";
import { pickLabel } from "@otd/shared";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useHasPermission } from "@/app/providers/auth-provider";
import { RequirePermission } from "@/app/router/guards";
import { StatusBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AuditTypeBadge } from "@/features/factoryaudit/components/audit-badges";
import { AuditDetailSheet } from "@/features/factoryaudit/components/audit-detail-sheet";
import { AuditFormDialog } from "@/features/factoryaudit/components/audit-form-dialog";
import { useStartAuditMutation } from "@/features/factoryaudit/factoryaudit.mutations";
import { useAuditPlansQuery } from "@/features/factoryaudit/factoryaudit.queries";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { formatDate } from "@/lib/date";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { AuditType, FactoryAuditDto } from "@/features/factoryaudit/factoryaudit.types";
import type { ColumnDef } from "@tanstack/react-table";

const TYPES = Object.keys(AUDIT_TYPES) as AuditType[];

export function AuditPlansPage() {
  const { t, i18n } = useTranslation("factoryaudit");
  const { t: tc } = useTranslation();
  const query = useTableQueryState();
  const plans = useAuditPlansQuery(query.params);
  const lookups = useLookups();
  const start = useStartAuditMutation();
  const [editing, setEditing] = useState<FactoryAuditDto | null | undefined>(undefined);
  const [detailId, setDetailId] = useState<string | null>(null);
  const can = {
    recordEdit: useHasPermission("factoryaudit.record.edit"),
    findingEdit: useHasPermission("factoryaudit.finding.edit"),
  };
  const [actionError, setActionError] = useState<string | null>(null);

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
      {
        accessorKey: "plannedDate",
        header: t("PLANNED_DATE"),
        cell: ({ row }) => formatDate(row.original.plannedDate),
      },
      { accessorKey: "auditor", header: t("AUDITOR"), cell: ({ row }) => row.original.auditor ?? "—" },
      { accessorKey: "ownerName", header: t("OWNER") },
      {
        accessorKey: "status",
        header: t("STATUS"),
        cell: ({ row }) => <StatusBadge code={row.original.status} machine="factoryAudit" />,
      },
      {
        id: "actions",
        header: tc("TBL_ACTIONS"),
        cell: ({ row }) => (
          <div className="flex gap-1 whitespace-nowrap">
            <RequirePermission code="factoryaudit.plan.edit">
              <Button className="h-auto px-1" variant="link" onClick={() => setEditing(row.original)}>
                {tc("1VV96U")}
              </Button>
            </RequirePermission>
            {row.original.status === "PLANNED" ? (
              <RequirePermission code="factoryaudit.record.edit">
                <Button
                  className="h-auto px-1"
                  disabled={start.isPending}
                  variant="link"
                  onClick={() => {
                    setActionError(null);
                    start
                      .mutateAsync({ id: row.original.id, version: row.original.version })
                      .catch((err: unknown) => setActionError(err instanceof Error ? err.message : tc("BIZERR")));
                  }}
                >
                  {t("START")}
                </Button>
              </RequirePermission>
            ) : (
              <Button className="h-auto px-1" variant="link" onClick={() => setDetailId(row.original.id)}>
                {t("DETAIL_TITLE")}
              </Button>
            )}
          </div>
        ),
      },
    ],
    [t, tc, start],
  );

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code="factoryaudit.plan.edit">
            <Button onClick={() => setEditing(null)}>{t("AUDIT_NEW")}</Button>
          </RequirePermission>
        }
        title={t("PLANS_TITLE")}
      />
      {actionError ? (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}
      <ServerDataTable
        columns={columns}
        error={plans.error}
        getRowId={(row) => row.id}
        isLoading={plans.isLoading}
        page={plans.data}
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
      <AuditFormDialog
        audit={editing ?? null}
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
      />
      <AuditDetailSheet auditId={detailId} can={can} onClose={() => setDetailId(null)} />
    </section>
  );
}
