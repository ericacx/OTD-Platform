import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { RequirePermission } from "@/app/router/guards";
import { ToneBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { CustomerFormDialog } from "@/features/masterdata/components/customer-form-dialog";
import { useCustomersQuery } from "@/features/masterdata/masterdata.queries";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { CustomerDto } from "@/features/masterdata/masterdata.types";
import type { ColumnDef } from "@tanstack/react-table";

export function CustomersPage() {
  const { t } = useTranslation("masterdata");
  const { t: tc } = useTranslation();
  const query = useTableQueryState();
  const customers = useCustomersQuery(query.params);
  const [editing, setEditing] = useState<CustomerDto | null | undefined>(undefined);

  const columns = useMemo<ColumnDef<CustomerDto, unknown>[]>(
    () => [
      {
        accessorKey: "code",
        header: t("CODE"),
        cell: ({ row }) => <span className="tabular font-semibold">{row.original.code}</span>,
      },
      {
        accessorKey: "name",
        header: t("NAME"),
        cell: ({ row }) => (
          <span className="leading-tight">
            <span className="block font-medium">{row.original.name}</span>
            <span className="block text-xs text-muted-foreground">{row.original.nameEn ?? ""}</span>
          </span>
        ),
      },
      {
        accessorKey: "settlementEntity",
        header: t("SETTLEMENT_ENTITY"),
        cell: ({ row }) => row.original.settlementEntity ?? "—",
      },
      {
        accessorKey: "paymentTermsDays",
        header: t("PAYMENT_TERMS"),
        cell: ({ row }) => t("TERMS_DAYS", { days: row.original.paymentTermsDays }),
      },
      { accessorKey: "currency", header: t("CURRENCY") },
      { accessorKey: "contactName", header: t("CONTACT"), cell: ({ row }) => row.original.contactName ?? "—" },
      {
        accessorKey: "aiAllowed",
        header: t("AI_ALLOWED"),
        cell: ({ row }) => (
          <ToneBadge
            label={row.original.aiAllowed ? t("YES") : t("NO")}
            tone={row.original.aiAllowed ? "success" : "neutral"}
          />
        ),
      },
      {
        accessorKey: "status",
        header: t("STATUS"),
        cell: ({ row }) => (
          <ToneBadge
            label={row.original.status === "ACTIVE" ? t("ACTIVE") : t("DISABLED")}
            tone={row.original.status === "ACTIVE" ? "success" : "neutral"}
          />
        ),
      },
      {
        id: "actions",
        header: tc("TBL_ACTIONS"),
        cell: ({ row }) => (
          <RequirePermission code="masterdata.customer.edit">
            <Button className="h-auto px-0" variant="link" onClick={() => setEditing(row.original)}>
              {tc("1VV96U")}
            </Button>
          </RequirePermission>
        ),
      },
    ],
    [t, tc],
  );

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code="masterdata.customer.edit">
            <Button onClick={() => setEditing(null)}>{t("CUSTOMER_NEW")}</Button>
          </RequirePermission>
        }
        title={t("CUSTOMERS_TITLE")}
      />
      <ServerDataTable
        columns={columns}
        error={customers.error}
        getRowId={(row) => row.id}
        isLoading={customers.isLoading}
        page={customers.data}
        query={query}
        searchPlaceholder={t("CUSTOMER_SEARCH")}
      />
      <CustomerFormDialog
        customer={editing ?? null}
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
      />
    </section>
  );
}
