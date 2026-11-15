import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { RequirePermission } from "@/app/router/guards";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { BaseFormDialog } from "@/features/masterdata/components/base-form-dialog";
import { DeleteConfirmDialog, type DeleteTarget } from "@/features/masterdata/components/delete-confirm-dialog";
import { FactoryFormDialog } from "@/features/masterdata/components/factory-form-dialog";
import { useBasesQuery, useFactoriesQuery } from "@/features/masterdata/reference-data.queries";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";
import { cn } from "@/lib/utils";

import type { BaseDetailDto, FactoryDto } from "@otd/contracts/masterdata";
import type { ColumnDef } from "@tanstack/react-table";

const SELECT_CLASS = "h-9 rounded-md border border-input bg-card px-2 text-sm";

export function FactoriesPage() {
  const { t } = useTranslation("masterdata");
  const { t: tc } = useTranslation();
  const query = useTableQueryState();
  const bases = useBasesQuery();
  const factories = useFactoriesQuery(query.params);
  const [editingBase, setEditingBase] = useState<BaseDetailDto | null | undefined>(undefined);
  const [editingFactory, setEditingFactory] = useState<FactoryDto | null | undefined>(undefined);
  const [deleteBase, setDeleteBase] = useState<DeleteTarget | null>(null);
  const [deleteFactory, setDeleteFactory] = useState<DeleteTarget | null>(null);
  const baseList = useMemo(() => bases.data?.items ?? [], [bases.data]);
  const selectedBase = query.filters.baseId;

  const columns = useMemo<ColumnDef<FactoryDto, unknown>[]>(
    () => [
      {
        accessorKey: "code",
        header: t("COL_CODE"),
        cell: ({ row }) => <span className="tabular font-semibold">{row.original.code}</span>,
      },
      {
        accessorKey: "name",
        header: t("COL_NAME"),
        cell: ({ row }) => (
          <span className="leading-tight">
            <span className="block font-medium">{row.original.name}</span>
            <span className="block text-xs text-muted-foreground">{row.original.nameEn ?? ""}</span>
          </span>
        ),
      },
      { accessorKey: "baseName", header: t("FACTORY_BASE") },
      {
        accessorKey: "legalEntity",
        header: t("FACTORY_LEGAL"),
        cell: ({ row }) => row.original.legalEntity ?? "—",
      },
      {
        id: "actions",
        header: tc("TBL_ACTIONS"),
        cell: ({ row }) => (
          <RequirePermission code="masterdata.factory.edit">
            <Button className="h-auto px-2 py-1" variant="link" onClick={() => setEditingFactory(row.original)}>
              {tc("1VV96U")}
            </Button>
            <Button
              className="h-auto px-2 py-1 text-destructive"
              variant="link"
              onClick={() =>
                setDeleteFactory({ id: row.original.id, version: row.original.version, name: row.original.name })
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
          <RequirePermission code="masterdata.factory.edit">
            <Button variant="outline" onClick={() => setEditingBase(null)}>
              {t("BASE_NEW")}
            </Button>
            <Button onClick={() => setEditingFactory(null)}>{t("FACTORY_NEW")}</Button>
          </RequirePermission>
        }
        title={t("FACTORIES_TITLE")}
      />
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">{t("BASES_TITLE")}</h2>
        {bases.isLoading ? (
          <LoadingState />
        ) : bases.error ? (
          <ErrorState error={bases.error} />
        ) : (
          <ul aria-label={t("BASES_TITLE")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {baseList.map((base) => {
              const active = selectedBase === base.id;
              return (
                <li
                  className={cn(
                    "flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-card p-4 shadow-xs",
                    active && "border-primary ring-1 ring-primary/30",
                  )}
                  key={base.id}
                >
                  <button
                    aria-pressed={active}
                    className="text-left"
                    type="button"
                    onClick={() => query.setFilter("baseId", active ? undefined : base.id)}
                  >
                    <span className="flex items-center gap-2">
                      <span className="tabular rounded-md bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
                        {base.code}
                      </span>
                      <span className="font-semibold">{base.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{base.country}</span>
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{base.nameEn ?? ""}</span>
                  </button>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">{t("BASE_FACTORY_COUNT")}</dt>
                      <dd className="tabular text-lg font-semibold">{base.factoryCount}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t("BASE_MACHINE_COUNT")}</dt>
                      <dd className="tabular text-lg font-semibold">{base.machineCount.toLocaleString()}</dd>
                    </div>
                  </dl>
                  <RequirePermission code="masterdata.factory.edit">
                    <div className="-mx-2 flex border-t border-border pt-2">
                      <Button
                        aria-label={`${tc("1VV96U")} ${base.name}`}
                        className="h-auto px-2 py-1"
                        variant="link"
                        onClick={() => setEditingBase(base)}
                      >
                        {tc("1VV96U")}
                      </Button>
                      <Button
                        aria-label={`${tc("jAiN8T")} ${base.name}`}
                        className="h-auto px-2 py-1 text-destructive"
                        variant="link"
                        onClick={() => setDeleteBase({ id: base.id, version: base.version, name: base.name })}
                      >
                        {tc("jAiN8T")}
                      </Button>
                    </div>
                  </RequirePermission>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">{t("FACTORY_LIST")}</h2>
        <ServerDataTable
          columns={columns}
          error={factories.error}
          getRowId={(row) => row.id}
          isLoading={factories.isLoading}
          page={factories.data}
          query={query}
          searchPlaceholder={t("FACTORY_SEARCH")}
          toolbar={
            <select
              aria-label={t("BASE_FILTER")}
              className={SELECT_CLASS}
              value={selectedBase ?? ""}
              onChange={(event) => query.setFilter("baseId", event.target.value || undefined)}
            >
              <option value="">{t("ALL_BASES")}</option>
              {baseList.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          }
        />
      </div>
      <BaseFormDialog
        base={editingBase ?? null}
        open={editingBase !== undefined}
        onOpenChange={(open) => !open && setEditingBase(undefined)}
      />
      <FactoryFormDialog
        bases={baseList}
        defaultBaseId={selectedBase}
        factory={editingFactory ?? null}
        open={editingFactory !== undefined}
        onOpenChange={(open) => !open && setEditingFactory(undefined)}
      />
      <DeleteConfirmDialog entity="bases" target={deleteBase} onClose={() => setDeleteBase(null)} />
      <DeleteConfirmDialog entity="factories" target={deleteFactory} onClose={() => setDeleteFactory(null)} />
    </section>
  );
}
