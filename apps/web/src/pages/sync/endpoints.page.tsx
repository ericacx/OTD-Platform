import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { RequirePermission } from "@/app/router/guards";
import { ToneBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { CredentialDialog } from "@/features/sync/components/credential-dialog";
import { EndpointFormDialog } from "@/features/sync/components/endpoint-form-dialog";
import { SYNC_KINDS, SYNC_PROTOCOLS, useSyncLabels } from "@/features/sync/sync.labels";
import { useTestEndpointMutation, useToggleEndpointMutation } from "@/features/sync/sync.mutations";
import { useSyncEndpointsQuery } from "@/features/sync/sync.queries";
import { formatDate } from "@/lib/date";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { SyncEndpointDto } from "@/features/sync/sync.types";
import type { ColumnDef } from "@tanstack/react-table";

const FILTER = "h-9 rounded-md border border-input bg-card px-2 text-sm";

export function EndpointsPage() {
  const { t } = useTranslation("sync");
  const { t: tc } = useTranslation();
  const labels = useSyncLabels();
  const query = useTableQueryState();
  const endpoints = useSyncEndpointsQuery(query.params);
  const test = useTestEndpointMutation();
  const toggle = useToggleEndpointMutation();
  const [form, setForm] = useState<SyncEndpointDto | null | undefined>(undefined);
  const [credential, setCredential] = useState<SyncEndpointDto | null>(null);

  const columns = useMemo<ColumnDef<SyncEndpointDto, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("SYSTEM"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium">{row.original.name}</p>
            <p className="text-xs text-muted-foreground">{row.original.code}</p>
          </div>
        ),
      },
      {
        accessorKey: "kind",
        header: t("KIND"),
        cell: ({ row }) => <span className="whitespace-nowrap">{labels.kind(row.original.kind)}</span>,
      },
      {
        accessorKey: "protocol",
        header: t("PROTOCOL"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p>{labels.protocol(row.original.protocol)}</p>
            {row.original.baseUrl ? (
              <p className="max-w-56 truncate text-xs text-muted-foreground">{row.original.baseUrl}</p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "customerName",
        header: t("CUSTOMER"),
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.customerName ?? "—"}</span>,
      },
      {
        accessorKey: "taskCount",
        header: t("TASK_COUNT"),
        meta: { align: "right" },
        cell: ({ row }) => <span className="tabular">{row.original.taskCount}</span>,
      },
      {
        id: "credential",
        header: t("CREDENTIAL"),
        cell: ({ row }) =>
          row.original.credential.configured ? (
            <ToneBadge label={t("CRED_CONFIGURED")} tone="success" />
          ) : (
            <ToneBadge label={t("CRED_NONE")} tone="neutral" />
          ),
      },
      {
        id: "lastTest",
        header: t("LAST_TEST"),
        cell: ({ row }) => {
          const last = row.original.lastTest;
          if (!last) return <span className="text-muted-foreground">{t("NEVER_TESTED")}</span>;
          return (
            <div className="min-w-0">
              <ToneBadge
                label={last.ok ? t("LAST_TEST_OK") : t("LAST_TEST_FAIL")}
                tone={last.ok ? "success" : "danger"}
              />
              <p className="tabular mt-0.5 text-xs text-muted-foreground" title={last.message ?? undefined}>
                {formatDate(last.at, true)}
              </p>
            </div>
          );
        },
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
        cell: ({ row }) => {
          const e = row.original;
          return (
            <div className="flex gap-1 whitespace-nowrap">
              <RequirePermission code="sync.endpoint.edit">
                <Button className="h-auto px-1" variant="link" onClick={() => setForm(e)}>
                  {tc("1VV96U")}
                </Button>
                <Button
                  className="h-auto px-1"
                  disabled={test.isPending}
                  variant="link"
                  onClick={() => {
                    void test
                      .mutateAsync(e.id)
                      .then((res) =>
                        res.ok
                          ? toast.success(t("TEST_OK", { ms: res.latencyMs }))
                          : toast.error(t("TEST_FAIL", { message: res.message })),
                      );
                  }}
                >
                  {t("TEST")}
                </Button>
                <Button
                  className="h-auto px-1"
                  variant="link"
                  onClick={() => {
                    void toggle.mutateAsync({ id: e.id, enable: e.status !== "ACTIVE", version: e.version });
                  }}
                >
                  {e.status === "ACTIVE" ? t("DISABLE") : t("ENABLE")}
                </Button>
              </RequirePermission>
              <RequirePermission code="sync.endpoint.credential">
                <Button className="h-auto px-1" variant="link" onClick={() => setCredential(e)}>
                  {t("CRED_TITLE")}
                </Button>
              </RequirePermission>
            </div>
          );
        },
      },
    ],
    [t, tc, labels, test, toggle],
  );

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code="sync.endpoint.edit">
            <Button onClick={() => setForm(null)}>{t("ENDPOINT_NEW")}</Button>
          </RequirePermission>
        }
        description={t("ENDPOINTS_NOTE")}
        title={t("ENDPOINTS_TITLE")}
      />
      <ServerDataTable
        columns={columns}
        error={endpoints.error}
        getRowId={(row) => row.id}
        isLoading={endpoints.isLoading}
        page={endpoints.data}
        query={query}
        searchPlaceholder={t("ENDPOINT_SEARCH")}
        toolbar={
          <>
            <select
              aria-label={t("KIND")}
              className={FILTER}
              value={query.filters.kind ?? ""}
              onChange={(event) => query.setFilter("kind", event.target.value || undefined)}
            >
              <option value="">{t("ALL_KINDS")}</option>
              {SYNC_KINDS.map((k) => (
                <option key={k} value={k}>
                  {labels.kind(k)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("PROTOCOL")}
              className={FILTER}
              value={query.filters.protocol ?? ""}
              onChange={(event) => query.setFilter("protocol", event.target.value || undefined)}
            >
              <option value="">{t("ALL_PROTOCOLS")}</option>
              {SYNC_PROTOCOLS.map((p) => (
                <option key={p} value={p}>
                  {labels.protocol(p)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("STATUS")}
              className={FILTER}
              value={query.filters.status ?? ""}
              onChange={(event) => query.setFilter("status", event.target.value || undefined)}
            >
              <option value="">{t("ALL_STATUS")}</option>
              <option value="ACTIVE">{t("ACTIVE")}</option>
              <option value="DISABLED">{t("DISABLED")}</option>
            </select>
          </>
        }
      />
      <EndpointFormDialog
        endpoint={form ?? null}
        open={form !== undefined}
        onOpenChange={(open) => !open && setForm(undefined)}
      />
      <CredentialDialog endpoint={credential} onClose={() => setCredential(null)} />
    </section>
  );
}
