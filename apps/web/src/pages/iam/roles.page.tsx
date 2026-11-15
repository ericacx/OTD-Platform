import { DATA_SCOPES, ROLE_TYPES, menuPermissionCodes, pickLabel } from "@otd/shared";
import { Building, KeyRound, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { RequirePermission } from "@/app/router/guards";
import { KpiCard } from "@/components/biz/kpi-card";
import { ToneBadge } from "@/components/biz/status-badge";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { RoleFormDialog } from "@/features/iam/components/role-form-dialog";
import { RoleGrantDialog } from "@/features/iam/components/role-grant-dialog";
import { useDeleteRoleMutation } from "@/features/iam/iam.mutations";
import { useRolesQuery } from "@/features/iam/iam.queries";
import { useLookups } from "@/features/masterdata/lookups.queries";

import type { RoleSummary } from "@/features/iam/iam.types";

const MENU_TOTAL = menuPermissionCodes().length;

export function RolesPage() {
  const { t, i18n } = useTranslation("iam");
  const { t: tc } = useTranslation();
  const roles = useRolesQuery();
  const lookups = useLookups();
  const remove = useDeleteRoleMutation();
  const [grantRole, setGrantRole] = useState<RoleSummary | null>(null);
  const [formRole, setFormRole] = useState<RoleSummary | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<RoleSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const lang = i18n.language;
  const list = roles.data ?? [];
  const members = list.reduce((sum, r) => sum + r.memberCount, 0);

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code="iam.role.edit">
            <Button onClick={() => setFormRole(null)}>{t("ROLE_NEW")}</Button>
          </RequirePermission>
        }
        title={t("ROLES_TITLE")}
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          hint={t("ROLES_ACTIVE", { count: list.filter((r) => r.status === "ACTIVE").length })}
          icon={ShieldCheck}
          label={t("KPI_ROLES")}
          tone="primary"
          unit={t("UNIT_ITEMS")}
          value={list.length}
        />
        <KpiCard
          hint={list.map((r) => `${r.name} ${r.memberCount}`).join(" · ")}
          icon={Users}
          label={t("KPI_ACCOUNTS")}
          unit={t("UNIT_PEOPLE")}
          value={members}
        />
        <KpiCard
          hint={t("KPI_MENU_HINT")}
          icon={KeyRound}
          label={t("KPI_MENU")}
          unit={t("UNIT_ITEMS")}
          value={MENU_TOTAL}
        />
        <KpiCard
          hint={t("KPI_CUSTOMER_HINT")}
          icon={Building}
          label={t("KPI_CUSTOMERS")}
          unit={t("UNIT_COMPANIES")}
          value={lookups.data?.customers.length ?? "—"}
        />
      </div>
      {roles.isLoading ? (
        <LoadingState />
      ) : roles.error ? (
        <ErrorState error={roles.error} />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="h-11 px-4 font-medium">{t("ROLE_CODE")}</th>
                  <th className="px-4 font-medium">{t("ROLE_NAME")}</th>
                  <th className="px-4 font-medium">{t("ROLE_TYPE")}</th>
                  <th className="px-4 font-medium">{t("DATA_SCOPE")}</th>
                  <th className="px-4 font-medium">{t("CUSTOMER_SCOPE")}</th>
                  <th className="px-4 font-medium">{t("MENU_PERMS")}</th>
                  <th className="px-4 text-right font-medium">{t("ACCOUNTS")}</th>
                  <th className="px-4 font-medium">{t("STATUS")}</th>
                  <th className="px-4 font-medium">{tc("TBL_ACTIONS")}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((role) => (
                  <tr className="h-12 border-t border-border hover:bg-muted/50" key={role.id}>
                    <td className="tabular px-4 text-muted-foreground">{role.code}</td>
                    <td className="px-4 font-semibold">{role.name}</td>
                    <td className="px-4">
                      <ToneBadge
                        label={pickLabel(ROLE_TYPES[role.type].label, lang)}
                        tone={role.type === "MANAGEMENT" ? "info" : "neutral"}
                      />
                    </td>
                    <td className="px-4">{pickLabel(DATA_SCOPES[role.dataScope].label, lang)}</td>
                    <td className="max-w-72 truncate px-4" title={role.customers.map((c) => c.name).join("、")}>
                      {role.allCustomers ? (
                        t("ALL_CUSTOMERS")
                      ) : role.customers.length ? (
                        role.customers.map((c) => c.name).join("、")
                      ) : (
                        <span className="text-muted-foreground">{t("UNAUTHORIZED")}</span>
                      )}
                    </td>
                    <td className="px-4">
                      <div className="flex items-center gap-2">
                        <div aria-hidden="true" className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${(role.menuPermissionCount / MENU_TOTAL) * 100}%` }}
                          />
                        </div>
                        <span className="tabular text-xs text-muted-foreground">
                          {role.menuPermissionCount} / {MENU_TOTAL}
                        </span>
                      </div>
                    </td>
                    <td className="tabular px-4 text-right">{role.memberCount}</td>
                    <td className="px-4">
                      <ToneBadge
                        label={role.status === "ACTIVE" ? t("ACTIVE") : t("DISABLED")}
                        tone={role.status === "ACTIVE" ? "success" : "neutral"}
                      />
                    </td>
                    <td className="px-4 whitespace-nowrap">
                      <RequirePermission code="iam.role.grant">
                        <Button className="h-auto px-2 py-1" variant="link" onClick={() => setGrantRole(role)}>
                          {t("GRANT")}
                        </Button>
                      </RequirePermission>
                      <RequirePermission code="iam.role.edit">
                        <Button className="h-auto px-2 py-1" variant="link" onClick={() => setFormRole(role)}>
                          {tc("1VV96U")}
                        </Button>
                        <Button
                          className="h-auto px-2 py-1 text-destructive"
                          variant="link"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleting(role);
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
      <RoleGrantDialog role={grantRole} onClose={() => setGrantRole(null)} />
      <RoleFormDialog
        open={formRole !== undefined}
        role={formRole ?? null}
        onOpenChange={(open) => !open && setFormRole(undefined)}
      />
      <ConfirmDialog
        description={deleteError ?? t("ROLE_DELETE_CONFIRM", { name: deleting?.name ?? "" })}
        isProcessing={remove.isPending}
        open={deleting !== null}
        title={tc("SXHEY7")}
        variant="destructive"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            setDeleting(null);
          } catch (err) {
            setDeleteError(err instanceof Error ? err.message : tc("BIZERR"));
          }
        }}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
    </section>
  );
}
