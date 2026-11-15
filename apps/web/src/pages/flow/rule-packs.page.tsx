import { RULE_KINDS } from "@otd/contracts/flow";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useHasPermission } from "@/app/providers/auth-provider";
import { RequirePermission } from "@/app/router/guards";
import { ToneBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { RULE_KIND_KEYS, errorText } from "@/features/flow/components/flow-labels";
import { RulePackFormDialog } from "@/features/flow/components/rule-pack-form-dialog";
import { RulePackVersionsSheet } from "@/features/flow/components/rule-pack-versions-sheet";
import { useDeleteRulePackMutation } from "@/features/flow/flow.mutations";
import { useRulePacksQuery } from "@/features/flow/flow.queries";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { formatDate } from "@/lib/date";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { RulePackDto } from "@/features/flow/flow.types";
import type { ColumnDef } from "@tanstack/react-table";

function formatParam(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function RulePacksPage() {
  const { t } = useTranslation("flow");
  const { t: tc } = useTranslation();
  const query = useTableQueryState({ pageSize: 50 });
  const packs = useRulePacksQuery(query.params);
  const lookups = useLookups();
  const remove = useDeleteRulePackMutation();
  const [editing, setEditing] = useState<RulePackDto | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<RulePackDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [historyOf, setHistoryOf] = useState<RulePackDto | null>(null);
  const canEditPacks = useHasPermission("flow.rulepack.edit");

  const columns = useMemo<ColumnDef<RulePackDto, unknown>[]>(
    () => [
      {
        accessorKey: "code",
        header: t("PACK_CODE"),
        cell: ({ row }) => <span className="tabular font-medium whitespace-nowrap">{row.original.code}</span>,
      },
      {
        accessorKey: "kind",
        header: t("PACK_KIND"),
        cell: ({ row }) => <ToneBadge label={t(RULE_KIND_KEYS[row.original.kind])} tone="info" />,
      },
      {
        accessorKey: "name",
        header: t("PACK_NAME"),
        cell: ({ row }) => (
          <span className="leading-tight">
            <span className="block font-medium">{row.original.name}</span>
            <span className="block text-xs text-muted-foreground">{row.original.description ?? ""}</span>
          </span>
        ),
      },
      {
        id: "scope",
        header: t("PACK_SCOPE"),
        cell: ({ row }) =>
          row.original.customerId ? (
            <ToneBadge
              label={`${row.original.customerCode ?? ""} ${row.original.customerName ?? ""}`.trim()}
              tone="warning"
            />
          ) : (
            <ToneBadge label={t("SCOPE_GLOBAL")} />
          ),
      },
      {
        id: "params",
        header: t("PACK_PARAMS"),
        cell: ({ row }) => (
          <span className="flex max-w-md flex-wrap gap-1">
            {Object.entries(row.original.params).map(([k, v]) => (
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs" key={k}>
                {k}: {formatParam(v)}
              </code>
            ))}
          </span>
        ),
      },
      {
        accessorKey: "enabled",
        header: t("ENABLED"),
        cell: ({ row }) => (
          <ToneBadge
            label={row.original.enabled ? t("ACTIVE") : t("DISABLED")}
            tone={row.original.enabled ? "success" : "neutral"}
          />
        ),
      },
      {
        accessorKey: "updatedAt",
        header: t("UPDATED_AT"),
        cell: ({ row }) => <span className="tabular">{formatDate(row.original.updatedAt, true)}</span>,
      },
      {
        id: "actions",
        header: tc("TBL_ACTIONS"),
        cell: ({ row }) => (
          <RequirePermission code="flow.rulepack.edit">
            <span className="whitespace-nowrap">
              <Button className="h-auto px-2 py-1" variant="link" onClick={() => setEditing(row.original)}>
                {tc("1VV96U")}
              </Button>
              <Button className="h-auto px-2 py-1" variant="link" onClick={() => setHistoryOf(row.original)}>
                {t("PACK_VERSIONS_ACTION")}
              </Button>
              {row.original.customerId ? (
                <Button
                  className="h-auto px-2 py-1 text-destructive"
                  variant="link"
                  onClick={() => {
                    setDeleteError(null);
                    setDeleting(row.original);
                  }}
                >
                  {tc("jAiN8T")}
                </Button>
              ) : null}
            </span>
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
          <RequirePermission code="flow.rulepack.edit">
            <Button onClick={() => setEditing(null)}>{t("PACK_NEW")}</Button>
          </RequirePermission>
        }
        description={t("PACKS_HINT")}
        title={t("PACKS_TITLE")}
      />
      <ServerDataTable
        columns={columns}
        error={packs.error}
        getRowId={(row) => row.id}
        isLoading={packs.isLoading}
        page={packs.data}
        query={query}
        searchPlaceholder={t("PACK_SEARCH")}
        toolbar={
          <>
            <select
              aria-label={t("PACK_KIND")}
              className="h-9 rounded-md border border-input bg-card px-2 text-sm"
              value={query.filters.kind ?? ""}
              onChange={(event) => query.setFilter("kind", event.target.value || undefined)}
            >
              <option value="">{t("ALL_KINDS")}</option>
              {RULE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(RULE_KIND_KEYS[k])}
                </option>
              ))}
            </select>
            <select
              aria-label={t("PACK_SCOPE")}
              className="h-9 rounded-md border border-input bg-card px-2 text-sm"
              value={query.filters.scope ?? ""}
              onChange={(event) => query.setFilter("scope", event.target.value || undefined)}
            >
              <option value="">{t("ALL_SCOPES")}</option>
              <option value="GLOBAL">{t("SCOPE_GLOBAL")}</option>
              <option value="CUSTOMER">{t("SCOPE_CUSTOMER")}</option>
            </select>
          </>
        }
      />
      <RulePackFormDialog
        customers={lookups.data?.customers ?? []}
        open={editing !== undefined}
        pack={editing ?? null}
        onOpenChange={(open) => !open && setEditing(undefined)}
      />
      <RulePackVersionsSheet
        canRollback={canEditPacks}
        pack={historyOf}
        onOpenChange={(open) => !open && setHistoryOf(null)}
      />
      <ConfirmDialog
        description={deleteError ?? t("PACK_DELETE_CONFIRM", { name: deleting?.name ?? "" })}
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
