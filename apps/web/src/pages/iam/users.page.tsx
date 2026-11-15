import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { RequirePermission } from "@/app/router/guards";
import { ToneBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { InitialPasswordDialog } from "@/features/iam/components/initial-password-dialog";
import { UserFormDialog } from "@/features/iam/components/user-form-dialog";
import { useResetPasswordMutation } from "@/features/iam/iam.mutations";
import { useOrgsQuery, useRolesQuery, useUsersQuery } from "@/features/iam/iam.queries";
import { formatDate } from "@/lib/date";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { UserSummary } from "@/features/iam/iam.types";
import type { ColumnDef } from "@tanstack/react-table";

export function UsersPage() {
  const { t } = useTranslation("iam");
  const { t: tc } = useTranslation();
  const query = useTableQueryState();
  const users = useUsersQuery(query.params);
  const orgs = useOrgsQuery();
  const roles = useRolesQuery();
  const reset = useResetPasswordMutation();
  const [form, setForm] = useState<UserSummary | null | undefined>(undefined);
  const [initialPassword, setInitialPassword] = useState<{ name: string; password: string } | null>(null);

  const columns = useMemo<ColumnDef<UserSummary, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("USER_NAME"),
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: "phone",
        header: t("PHONE"),
        cell: ({ row }) => <span className="tabular">{row.original.phone}</span>,
      },
      { accessorKey: "email", header: t("EMAIL"), cell: ({ row }) => row.original.email ?? "—" },
      { accessorKey: "orgName", header: t("ORG") },
      {
        id: "roles",
        header: t("ROLES"),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.roles.map((r) => (
              <ToneBadge key={r.id} label={r.name} tone="info" />
            ))}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: t("STATUS"),
        cell: ({ row }) => (
          <ToneBadge
            label={
              row.original.status === "ACTIVE"
                ? t("USER_ACTIVE")
                : row.original.status === "LEFT"
                  ? t("USER_LEFT")
                  : t("DISABLED")
            }
            tone={row.original.status === "ACTIVE" ? "success" : "neutral"}
          />
        ),
      },
      {
        accessorKey: "lastLoginAt",
        header: t("LAST_LOGIN"),
        cell: ({ row }) => formatDate(row.original.lastLoginAt, true),
      },
      {
        id: "actions",
        header: tc("TBL_ACTIONS"),
        cell: ({ row }) => (
          <div className="flex gap-1 whitespace-nowrap">
            <RequirePermission code="iam.user.edit">
              <Button className="h-auto px-1" variant="link" onClick={() => setForm(row.original)}>
                {tc("1VV96U")}
              </Button>
            </RequirePermission>
            <RequirePermission code="iam.user.resetPassword">
              <Button
                className="h-auto px-1"
                variant="link"
                onClick={() => {
                  void reset
                    .mutateAsync(row.original.id)
                    .then((result) =>
                      setInitialPassword({ name: row.original.name, password: result.initialPassword }),
                    );
                }}
              >
                {t("RESET_PASSWORD")}
              </Button>
            </RequirePermission>
          </div>
        ),
      },
    ],
    [t, tc, reset],
  );

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code="iam.user.edit">
            <Button onClick={() => setForm(null)}>{t("USER_NEW")}</Button>
          </RequirePermission>
        }
        title={t("USERS_TITLE")}
      />
      <ServerDataTable
        columns={columns}
        error={users.error}
        getRowId={(row) => row.id}
        isLoading={users.isLoading}
        page={users.data}
        query={query}
        searchPlaceholder={t("USER_SEARCH")}
        toolbar={
          <>
            <select
              aria-label={t("ORG")}
              className="h-9 rounded-md border border-input bg-card px-2 text-sm"
              value={query.filters.orgId ?? ""}
              onChange={(event) => query.setFilter("orgId", event.target.value || undefined)}
            >
              <option value="">{t("ALL_ORGS")}</option>
              {(orgs.data ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <select
              aria-label={t("ROLES")}
              className="h-9 rounded-md border border-input bg-card px-2 text-sm"
              value={query.filters.roleId ?? ""}
              onChange={(event) => query.setFilter("roleId", event.target.value || undefined)}
            >
              <option value="">{t("ALL_ROLES")}</option>
              {(roles.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <select
              aria-label={t("STATUS")}
              className="h-9 rounded-md border border-input bg-card px-2 text-sm"
              value={query.filters.status ?? ""}
              onChange={(event) => query.setFilter("status", event.target.value || undefined)}
            >
              <option value="">{t("ALL_STATUS")}</option>
              <option value="ACTIVE">{t("USER_ACTIVE")}</option>
              <option value="DISABLED">{t("DISABLED")}</option>
              <option value="LEFT">{t("USER_LEFT")}</option>
            </select>
          </>
        }
      />
      <UserFormDialog
        open={form !== undefined}
        orgs={orgs.data ?? []}
        roles={roles.data ?? []}
        user={form ?? null}
        onCreated={(password, name) => setInitialPassword({ password, name })}
        onOpenChange={(open) => !open && setForm(undefined)}
      />
      <InitialPasswordDialog value={initialPassword} onClose={() => setInitialPassword(null)} />
    </section>
  );
}
