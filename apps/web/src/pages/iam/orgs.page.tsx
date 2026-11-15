import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { RequirePermission } from "@/app/router/guards";
import { SectionCard } from "@/components/biz/detail-header-card";
import { FieldGrid } from "@/components/biz/field-grid";
import { ToneBadge } from "@/components/biz/status-badge";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { InitialPasswordDialog } from "@/features/iam/components/initial-password-dialog";
import { OrgFormDialog } from "@/features/iam/components/org-form-dialog";
import { OrgTree } from "@/features/iam/components/org-tree";
import { UserFormDialog } from "@/features/iam/components/user-form-dialog";
import { useDeleteOrgMutation } from "@/features/iam/iam.mutations";
import { useOrgsQuery, useRolesQuery, useUsersQuery } from "@/features/iam/iam.queries";
import { formatDate } from "@/lib/date";

import type { UserSummary } from "@/features/iam/iam.types";

export function OrgsPage() {
  const { t } = useTranslation("iam");
  const { t: tc } = useTranslation();
  const orgs = useOrgsQuery();
  const roles = useRolesQuery();
  const remove = useDeleteOrgMutation();
  const [pickedId, setSelectedId] = useState<string | null>(null);
  const [includeChildren, setIncludeChildren] = useState(true);
  const [orgForm, setOrgForm] = useState<{ mode: "edit" | "child" } | null>(null);
  const [userForm, setUserForm] = useState<UserSummary | null | undefined>(undefined);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [initialPassword, setInitialPassword] = useState<{ name: string; password: string } | null>(null);

  const list = useMemo(() => orgs.data ?? [], [orgs.data]);
  const selectedId = pickedId ?? list[0]?.id ?? null;
  const selected = list.find((o) => o.id === selectedId) ?? null;
  const parent = selected?.parentId ? list.find((o) => o.id === selected.parentId) : undefined;
  const children = list.filter((o) => o.parentId === selected?.id);
  const members = useUsersQuery({ orgId: selected?.id, includeChildren, pageSize: 100 }, Boolean(selected));

  return (
    <section className="space-y-5">
      <PageHeader title={t("ORGS_TITLE")} />
      {orgs.isLoading ? (
        <LoadingState />
      ) : orgs.error ? (
        <ErrorState error={orgs.error} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
          <div className="rounded-[var(--radius)] border border-border bg-card p-3 shadow-xs lg:h-[calc(100vh-180px)]">
            <OrgTree nodes={list} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
          {selected ? (
            <div className="min-w-0 space-y-5">
              <SectionCard
                extra={
                  <RequirePermission code="iam.org.edit">
                    <Button size="sm" variant="outline" onClick={() => setOrgForm({ mode: "edit" })}>
                      {tc("1VV96U")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleting(true);
                      }}
                    >
                      {tc("jAiN8T")}
                    </Button>
                    <Button size="sm" onClick={() => setOrgForm({ mode: "child" })}>
                      {t("ORG_NEW_CHILD")}
                    </Button>
                  </RequirePermission>
                }
                title={
                  <span>
                    {selected.name}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {selected.code} · {parent ? parent.name : t("ORG_TOP")}
                    </span>
                  </span>
                }
              >
                <FieldGrid
                  items={[
                    { label: t("ORG_NAME"), value: selected.name },
                    { label: t("ORG_CODE"), value: selected.code },
                    { label: t("ORG_PARENT"), value: parent?.name ?? t("ORG_TOP") },
                    { label: t("ORG_TYPE"), value: t(`ORG_TYPE_${selected.type}`) },
                    { label: t("ORG_FUNCTION"), value: t(`FN_${selected.function}`) },
                    { label: t("ORG_LEADER"), value: selected.leaderName },
                    { label: t("ORG_HEADCOUNT"), value: selected.memberCount },
                    { label: t("ORG_CHILDREN"), value: children.length },
                    {
                      label: t("STATUS"),
                      value: (
                        <ToneBadge
                          label={selected.status === "ACTIVE" ? t("ACTIVE") : t("DISABLED")}
                          tone={selected.status === "ACTIVE" ? "success" : "neutral"}
                        />
                      ),
                    },
                    { label: t("CREATED_AT"), value: formatDate(selected.createdAt, true) },
                    { label: t("UPDATED_AT"), value: formatDate(selected.updatedAt, true) },
                    { label: t("DESCRIPTION"), value: selected.description, span: "full" },
                  ]}
                />
              </SectionCard>
              <SectionCard
                bodyClassName="p-0"
                extra={
                  <>
                    <label className="flex items-center gap-2">
                      <Switch
                        aria-label={t("INCLUDE_CHILDREN")}
                        checked={includeChildren}
                        onCheckedChange={setIncludeChildren}
                      />
                      {t("INCLUDE_CHILDREN")}
                    </label>
                    <RequirePermission code="iam.user.edit">
                      <Button size="sm" onClick={() => setUserForm(null)}>
                        {t("USER_ADD")}
                      </Button>
                    </RequirePermission>
                  </>
                }
                title={t("MEMBERS", { count: members.data?.total ?? 0 })}
              >
                {members.isLoading ? (
                  <LoadingState className="m-4" />
                ) : (members.data?.items.length ?? 0) === 0 ? (
                  <EmptyState className="m-4" title={tc("83WV56")} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted text-left text-muted-foreground">
                        <tr>
                          <th className="h-10 px-4 font-medium">{t("MEMBER")}</th>
                          <th className="px-4 font-medium">{t("ACCOUNT")}</th>
                          <th className="px-4 font-medium">{t("ROLES")}</th>
                          <th className="px-4 font-medium">{t("STATUS")}</th>
                          <th className="px-4 font-medium">{tc("TBL_ACTIONS")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.data?.items.map((u) => (
                          <tr className="h-14 border-t border-border" key={u.id}>
                            <td className="px-4">
                              <div className="flex items-center gap-3">
                                <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                                  {u.name.slice(0, 1)}
                                </span>
                                <span className="leading-tight">
                                  <span className="block font-medium">{u.name}</span>
                                  <span className="block text-xs text-muted-foreground">{u.orgName}</span>
                                </span>
                              </div>
                            </td>
                            <td className="px-4 leading-tight">
                              <span className="block">{u.email ?? "—"}</span>
                              <span className="tabular block text-xs text-muted-foreground">{u.phone}</span>
                            </td>
                            <td className="px-4">
                              <div className="flex flex-wrap gap-1">
                                {u.roles.map((r) => (
                                  <ToneBadge key={r.id} label={r.name} tone="info" />
                                ))}
                              </div>
                            </td>
                            <td className="px-4">
                              <ToneBadge
                                label={
                                  u.status === "ACTIVE"
                                    ? t("USER_ACTIVE")
                                    : u.status === "LEFT"
                                      ? t("USER_LEFT")
                                      : t("DISABLED")
                                }
                                tone={u.status === "ACTIVE" ? "success" : "neutral"}
                              />
                            </td>
                            <td className="px-4">
                              <RequirePermission code="iam.user.edit">
                                <Button className="h-auto px-0" variant="link" onClick={() => setUserForm(u)}>
                                  {tc("1VV96U")}
                                </Button>
                              </RequirePermission>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            </div>
          ) : (
            <EmptyState title={t("ORG_SELECT")} />
          )}
        </div>
      )}
      <OrgFormDialog
        open={orgForm !== null}
        org={orgForm?.mode === "edit" ? selected : null}
        orgs={list}
        parentId={orgForm?.mode === "child" ? (selected?.id ?? null) : null}
        onOpenChange={(open) => !open && setOrgForm(null)}
      />
      <UserFormDialog
        defaultOrgId={selected?.id ?? null}
        open={userForm !== undefined}
        orgs={list}
        roles={roles.data ?? []}
        user={userForm ?? null}
        onCreated={(password, name) => setInitialPassword({ password, name })}
        onOpenChange={(open) => !open && setUserForm(undefined)}
      />
      <InitialPasswordDialog value={initialPassword} onClose={() => setInitialPassword(null)} />
      <ConfirmDialog
        description={deleteError ?? t("ORG_DELETE_CONFIRM", { name: selected?.name ?? "" })}
        isProcessing={remove.isPending}
        open={deleting}
        title={tc("SXHEY7")}
        variant="destructive"
        onConfirm={async () => {
          if (!selected) return;
          try {
            await remove.mutateAsync(selected.id);
            setDeleting(false);
            setSelectedId(selected.parentId);
          } catch (err) {
            setDeleteError(err instanceof Error ? err.message : tc("BIZERR"));
          }
        }}
        onOpenChange={setDeleting}
      />
    </section>
  );
}
