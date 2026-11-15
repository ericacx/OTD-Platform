import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { RequirePermission } from "@/app/router/guards";
import { ToneBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog, type DeleteTarget } from "@/features/masterdata/components/delete-confirm-dialog";
import { MATERIAL_CATEGORIES, MaterialFormDialog } from "@/features/masterdata/components/material-form-dialog";
import { useMaterialsQuery } from "@/features/masterdata/reference-data.queries";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { MaterialDto } from "@otd/contracts/masterdata";
import type { Tone } from "@otd/shared";
import type { ColumnDef } from "@tanstack/react-table";

const SELECT_CLASS = "h-9 rounded-md border border-input bg-card px-2 text-sm";
const CATEGORY_TONE: Record<MaterialDto["category"], Tone> = { YARN: "info", TRIM: "warning", PACKAGING: "neutral" };

export function MaterialsPage() {
  const { t } = useTranslation("masterdata");
  const { t: tc } = useTranslation();
  const query = useTableQueryState();
  const materials = useMaterialsQuery(query.params);
  const [editing, setEditing] = useState<MaterialDto | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);

  const columns = useMemo<ColumnDef<MaterialDto, unknown>[]>(() => {
    const categoryLabel = (c: MaterialDto["category"]) =>
      c === "YARN" ? t("CAT_YARN") : c === "TRIM" ? t("CAT_TRIM") : t("CAT_PACKAGING");
    return [
      {
        accessorKey: "code",
        header: t("COL_CODE"),
        cell: ({ row }) => <span className="tabular font-semibold">{row.original.code}</span>,
      },
      { accessorKey: "name", header: t("COL_NAME") },
      {
        accessorKey: "category",
        header: t("MATERIAL_CATEGORY"),
        cell: ({ row }) => (
          <ToneBadge label={categoryLabel(row.original.category)} tone={CATEGORY_TONE[row.original.category]} />
        ),
      },
      { accessorKey: "spec", header: t("MATERIAL_SPEC"), cell: ({ row }) => row.original.spec ?? "—" },
      { accessorKey: "unit", header: t("MATERIAL_UNIT") },
      {
        accessorKey: "unitPrice",
        header: t("MATERIAL_PRICE"),
        meta: { align: "right" },
        cell: ({ row }) =>
          row.original.unitPrice === null ? (
            "—"
          ) : (
            <span className="tabular">
              {row.original.currency} {row.original.unitPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}
            </span>
          ),
      },
      { accessorKey: "supplier", header: t("MATERIAL_SUPPLIER"), cell: ({ row }) => row.original.supplier ?? "—" },
      {
        id: "actions",
        header: tc("TBL_ACTIONS"),
        cell: ({ row }) => (
          <RequirePermission code="masterdata.material.edit">
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
    ];
  }, [t, tc]);

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code="masterdata.material.edit">
            <Button onClick={() => setEditing(null)}>{t("MATERIAL_NEW")}</Button>
          </RequirePermission>
        }
        title={t("MATERIALS_TITLE")}
      />
      <ServerDataTable
        columns={columns}
        error={materials.error}
        getRowId={(row) => row.id}
        isLoading={materials.isLoading}
        page={materials.data}
        query={query}
        searchPlaceholder={t("MATERIAL_SEARCH")}
        toolbar={
          <select
            aria-label={t("MATERIAL_CATEGORY")}
            className={SELECT_CLASS}
            value={query.filters.category ?? ""}
            onChange={(event) => query.setFilter("category", event.target.value || undefined)}
          >
            <option value="">{t("ALL_CATEGORIES")}</option>
            {MATERIAL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c === "YARN" ? t("CAT_YARN") : c === "TRIM" ? t("CAT_TRIM") : t("CAT_PACKAGING")}
              </option>
            ))}
          </select>
        }
      />
      <MaterialFormDialog
        material={editing ?? null}
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
      />
      <DeleteConfirmDialog entity="materials" target={deleting} onClose={() => setDeleting(null)} />
    </section>
  );
}
