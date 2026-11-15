import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { RequirePermission } from "@/app/router/guards";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { AgencyFormDialog } from "@/features/masterdata/components/agency-form-dialog";
import { DeleteConfirmDialog, type DeleteTarget } from "@/features/masterdata/components/delete-confirm-dialog";
import { useAgenciesQuery } from "@/features/masterdata/reference-data.queries";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { AgencyDto } from "@otd/contracts/masterdata";
import type { ColumnDef } from "@tanstack/react-table";

export function TestAgenciesPage() {
  const { t } = useTranslation("masterdata");
  const { t: tc } = useTranslation();
  const query = useTableQueryState();
  const agencies = useAgenciesQuery(query.params);
  const [editing, setEditing] = useState<AgencyDto | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);

  const columns = useMemo<ColumnDef<AgencyDto, unknown>[]>(
    () => [
      {
        accessorKey: "code",
        header: t("COL_CODE"),
        cell: ({ row }) => <span className="tabular font-semibold">{row.original.code}</span>,
      },
      { accessorKey: "name", header: t("COL_NAME") },
      { accessorKey: "city", header: t("AGENCY_CITY"), cell: ({ row }) => row.original.city ?? "—" },
      { accessorKey: "contact", header: t("COL_CONTACT"), cell: ({ row }) => row.original.contact ?? "—" },
      {
        id: "actions",
        header: tc("TBL_ACTIONS"),
        cell: ({ row }) => (
          <RequirePermission code="masterdata.agency.edit">
            <Button className="h-auto px-2 py-1" variant="link" onClick={() => setEditing(row.original)}>
              {tc("1VV96U")}
            </Button>
            <Button
              className="h-auto px-2 py-1 text-destructive"
              variant="link"
              onClick={() =>
                setDeleting({ id: row.original.id, version: row.original.version, name: row.original.name })
              }
            >
              {tc("jAiN8T")}
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
          <RequirePermission code="masterdata.agency.edit">
            <Button onClick={() => setEditing(null)}>{t("AGENCY_NEW")}</Button>
          </RequirePermission>
        }
        title={t("AGENCIES_TITLE")}
      />
      <ServerDataTable
        columns={columns}
        error={agencies.error}
        getRowId={(row) => row.id}
        isLoading={agencies.isLoading}
        page={agencies.data}
        query={query}
        searchPlaceholder={t("AGENCY_SEARCH")}
      />
      <AgencyFormDialog
        agency={editing ?? null}
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
      />
      <DeleteConfirmDialog entity="agencies" target={deleting} onClose={() => setDeleting(null)} />
    </section>
  );
}
