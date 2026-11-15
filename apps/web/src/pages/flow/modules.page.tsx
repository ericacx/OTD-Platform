import { Layers, ListChecks, Users, Wrench } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useHasPermission } from "@/app/providers/auth-provider";
import { RequirePermission } from "@/app/router/guards";
import { KpiCard } from "@/components/biz/kpi-card";
import { ToneBadge } from "@/components/biz/status-badge";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AssignCustomersDialog } from "@/features/flow/components/assign-customers-dialog";
import { errorText } from "@/features/flow/components/flow-labels";
import { ModuleFormDialog } from "@/features/flow/components/module-form-dialog";
import { ModuleItemsSheet } from "@/features/flow/components/module-items-sheet";
import { useDeleteModuleMutation } from "@/features/flow/flow.mutations";
import { useServiceModulesQuery } from "@/features/flow/flow.queries";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { cn } from "@/lib/utils";

import type { ServiceModuleDto } from "@/features/flow/flow.types";

export function ServiceModulesPage() {
  const { t, i18n } = useTranslation("flow");
  const { t: tc } = useTranslation();
  const [keyword, setKeyword] = useState("");
  const modules = useServiceModulesQuery({ pageSize: 100 });
  const lookups = useLookups();
  const canEditCatalog = useHasPermission("flow.module.edit");
  const canEditFlow = useHasPermission("flow.customer.edit");
  const [itemsOf, setItemsOf] = useState<string | null>(null);
  const [editing, setEditing] = useState<ServiceModuleDto | null | undefined>(undefined);
  const [assigning, setAssigning] = useState<ServiceModuleDto | null>(null);
  const [deleting, setDeleting] = useState<ServiceModuleDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const remove = useDeleteModuleMutation();
  const en = i18n.language.startsWith("en");
  const all = modules.data?.items ?? [];
  const kw = keyword.trim().toLowerCase();
  const list = kw ? all.filter((m) => `${m.code} ${m.name} ${m.nameEn ?? ""}`.toLowerCase().includes(kw)) : all;
  const live = all.filter((m) => m.hasPage);

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <>
            <Input
              aria-label={t("MODULE_SEARCH")}
              className="h-9 w-56"
              placeholder={t("MODULE_SEARCH")}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <RequirePermission code="flow.module.edit">
              <Button onClick={() => setEditing(null)}>{t("MODULE_NEW")}</Button>
            </RequirePermission>
          </>
        }
        title={t("MODULES_TITLE")}
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard icon={Layers} label={t("KPI_MODULES")} tone="primary" unit={t("UNIT_ITEMS")} value={live.length} />
        <KpiCard
          icon={ListChecks}
          label={t("KPI_ITEMS")}
          unit={t("UNIT_ITEMS")}
          value={live.reduce((n, m) => n + m.itemCount, 0)}
        />
        <KpiCard
          icon={Users}
          label={t("KPI_ENABLED_ITEMS")}
          unit={t("UNIT_ITEMS")}
          value={live.reduce((n, m) => n + (m.enabledItemTotal ?? 0), 0)}
        />
        <KpiCard
          icon={Wrench}
          label={t("KPI_PENDING")}
          tone="warning"
          unit={t("UNIT_ITEMS")}
          value={all.length - live.length}
        />
      </div>
      {modules.isLoading ? (
        <LoadingState />
      ) : modules.error ? (
        <ErrorState error={modules.error} />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="h-11 px-4 font-medium">{t("MODULE")}</th>
                  <th className="px-4 font-medium">{t("DEPARTMENT")}</th>
                  <th className="px-4 font-medium">{t("NODES")}</th>
                  <th className="px-4 text-right font-medium">{t("ITEM_OPTIONS")}</th>
                  <th className="px-4 text-right font-medium">{t("CUSTOMERS_CONFIGURED")}</th>
                  <th className="px-4 text-right font-medium">{t("ITEMS_ENABLED")}</th>
                  <th className="px-4 font-medium">{tc("TBL_ACTIONS")}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((m) => (
                  <tr
                    className={cn(
                      "h-12 border-t border-border hover:bg-muted/50",
                      !m.hasPage && "bg-muted/40 text-muted-foreground",
                    )}
                    data-pending={!m.hasPage}
                    key={m.id}
                  >
                    <td className="px-4">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="tabular text-xs text-muted-foreground">{m.code}</span>
                        <span className="font-semibold">{en && m.nameEn ? m.nameEn : m.name}</span>
                        {m.hasPage ? null : <ToneBadge label={t("NO_PAGE")} tone="warning" />}
                      </span>
                    </td>
                    <td className="px-4">{m.department}</td>
                    <td className="px-4">
                      <span className="flex flex-wrap gap-1">
                        {m.nodes.length ? m.nodes.map((n) => <ToneBadge key={n} label={n} tone="info" />) : "—"}
                      </span>
                    </td>
                    <td className="tabular px-4 text-right">{t("ITEM_COUNT", { count: m.itemCount })}</td>
                    <td className="tabular px-4 text-right">
                      {m.customerCount === null
                        ? "—"
                        : t("CUSTOMER_COUNT", { count: m.customerCount, total: lookups.data?.customers.length ?? "—" })}
                    </td>
                    <td className="tabular px-4 text-right">
                      {m.enabledItemTotal === null ? "—" : t("ITEM_COUNT", { count: m.enabledItemTotal })}
                    </td>
                    <td className="px-4 whitespace-nowrap">
                      <Button className="h-auto px-2 py-1" variant="link" onClick={() => setItemsOf(m.id)}>
                        {t("ITEMS")}
                      </Button>
                      {m.hasPage ? (
                        canEditFlow ? (
                          <Button className="h-auto px-2 py-1" variant="link" onClick={() => setAssigning(m)}>
                            {t("ASSIGN")}
                          </Button>
                        ) : null
                      ) : (
                        <span className="px-2 text-xs">{t("PLANNED")}</span>
                      )}
                      <RequirePermission code="flow.module.edit">
                        <Button className="h-auto px-2 py-1" variant="link" onClick={() => setEditing(m)}>
                          {tc("1VV96U")}
                        </Button>
                        <Button
                          className="h-auto px-2 py-1 text-destructive"
                          variant="link"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleting(m);
                          }}
                        >
                          {tc("jAiN8T")}
                        </Button>
                      </RequirePermission>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
            {tc("PGTOTAL", { count: list.length })}
          </p>
        </div>
      )}
      <ModuleItemsSheet canEdit={canEditCatalog} moduleId={itemsOf} onClose={() => setItemsOf(null)} />
      <ModuleFormDialog
        module={editing ?? null}
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
      />
      <AssignCustomersDialog
        customers={lookups.data?.customers ?? []}
        module={assigning}
        onClose={() => setAssigning(null)}
      />
      <ConfirmDialog
        description={
          deleteError ??
          t("MODULE_DELETE_CONFIRM", {
            name: deleting ? (en && deleting.nameEn ? deleting.nameEn : deleting.name) : "",
          })
        }
        isProcessing={remove.isPending}
        open={deleting !== null}
        title={tc("SXHEY7")}
        variant="destructive"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync({ id: deleting.id, version: deleting.version });
            setDeleting(null);
          } catch (err) {
            setDeleteError(errorText(err, tc("BIZERR")));
          }
        }}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
    </section>
  );
}
