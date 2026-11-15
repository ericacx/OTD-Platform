import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { RequirePermission } from "@/app/router/guards";
import { DocNoLink } from "@/components/biz/doc-no-link";
import { PrimaryTag, StatusBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { PlanFormDialog } from "@/features/packaging/components/plan-form-dialog";
import { CustomerFilter, StatusFilter } from "@/features/packaging/components/status-filter";
import { usePackagingPlansQuery } from "@/features/packaging/packaging.queries";
import { formatDate } from "@/lib/date";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { PackagingPlanDto } from "@/features/packaging/packaging.types";
import type { ColumnDef } from "@tanstack/react-table";

export function PackagingPlansPage() {
  const { t } = useTranslation("packaging");
  const navigate = useNavigate();
  const query = useTableQueryState();
  const plans = usePackagingPlansQuery(query.params);
  const lookups = useLookups();
  const [creating, setCreating] = useState(false);

  const columns = useMemo<ColumnDef<PackagingPlanDto, unknown>[]>(
    () => [
      {
        accessorKey: "docNo",
        header: t("DOC_NO"),
        cell: ({ row }) => <DocNoLink no={row.original.docNo} to={`/packaging/${row.original.id}`} />,
      },
      { accessorKey: "customerName", header: t("CUSTOMER") },
      {
        accessorKey: "poNo",
        header: t("ORDER"),
        cell: ({ row }) => (
          <DocNoLink
            no={row.original.poNo}
            {...(row.original.orderId ? { to: `/orders/${row.original.orderId}` } : {})}
          />
        ),
      },
      {
        accessorKey: "styleNo",
        header: t("STYLE_NO"),
        cell: ({ row }) => (row.original.styleNo ? `#${row.original.styleNo}` : "—"),
      },
      { accessorKey: "method", header: t("F_method"), cell: ({ row }) => row.original.method ?? row.original.title },
      {
        accessorKey: "currentVersion",
        header: t("VERSION"),
        cell: ({ row }) => <PrimaryTag>{`v${row.original.currentVersion}`}</PrimaryTag>,
      },
      {
        accessorKey: "status",
        header: t("STATUS"),
        cell: ({ row }) => <StatusBadge code={row.original.status} machine="packagingPlan" />,
      },
      { accessorKey: "ownerName", header: t("OWNER") },
      {
        accessorKey: "updatedAt",
        header: t("UPDATED_AT"),
        cell: ({ row }) => <span className="tabular text-muted-foreground">{formatDate(row.original.updatedAt)}</span>,
      },
    ],
    [t],
  );

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code="packaging.plan.create">
            <Button onClick={() => setCreating(true)}>{t("PLAN_NEW")}</Button>
          </RequirePermission>
        }
        title={t("PLANS_TITLE")}
      />
      <ServerDataTable
        columns={columns}
        error={plans.error}
        getRowId={(row) => row.id}
        isLoading={plans.isLoading}
        page={plans.data}
        query={query}
        searchPlaceholder={t("PLAN_SEARCH")}
        toolbar={
          <>
            <CustomerFilter
              allLabel={t("ALL_CUSTOMERS")}
              customers={lookups.data?.customers ?? []}
              label={t("CUSTOMER")}
              value={query.filters.customerId}
              onChange={(v) => query.setFilter("customerId", v)}
            />
            <StatusFilter
              allLabel={t("ALL_STATUS")}
              label={t("STATUS")}
              machine="packagingPlan"
              value={query.filters.status}
              onChange={(v) => query.setFilter("status", v)}
            />
          </>
        }
        onRowClick={(row) => void navigate(`/packaging/${row.id}`)}
      />
      <PlanFormDialog
        open={creating}
        plan={null}
        onCreated={(plan) => void navigate(`/packaging/${plan.id}`)}
        onOpenChange={setCreating}
      />
    </section>
  );
}
