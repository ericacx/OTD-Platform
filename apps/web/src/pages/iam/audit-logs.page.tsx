import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuditLogsQuery } from "@/features/iam/iam.queries";
import { formatDate } from "@/lib/date";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { AuditLog } from "@/features/iam/iam.types";
import type { ColumnDef } from "@tanstack/react-table";

export function AuditLogsPage() {
  const { t } = useTranslation("iam");
  const query = useTableQueryState();
  const logs = useAuditLogsQuery(query.params);
  const [viewing, setViewing] = useState<AuditLog | null>(null);

  const columns = useMemo<ColumnDef<AuditLog, unknown>[]>(
    () => [
      {
        accessorKey: "at",
        header: t("LOG_AT"),
        cell: ({ row }) => <span className="tabular whitespace-nowrap">{formatDate(row.original.at, true)}</span>,
      },
      { accessorKey: "userName", header: t("LOG_USER"), cell: ({ row }) => row.original.userName ?? t("LOG_SYSTEM") },
      {
        accessorKey: "action",
        header: t("LOG_ACTION"),
        cell: ({ row }) => <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{row.original.action}</code>,
      },
      { accessorKey: "objectType", header: t("LOG_OBJECT"), cell: ({ row }) => row.original.objectType ?? "—" },
      {
        accessorKey: "docNo",
        header: t("LOG_DOC"),
        cell: ({ row }) => <span className="tabular">{row.original.docNo ?? "—"}</span>,
      },
      {
        accessorKey: "ip",
        header: "IP",
        cell: ({ row }) => <span className="tabular text-muted-foreground">{row.original.ip ?? "—"}</span>,
      },
      {
        id: "diff",
        header: t("LOG_DIFF"),
        cell: ({ row }) =>
          row.original.diff && Object.keys(row.original.diff).length ? (
            <Button className="h-auto px-0" variant="link" onClick={() => setViewing(row.original)}>
              {t("LOG_VIEW")}
            </Button>
          ) : (
            "—"
          ),
      },
    ],
    [t],
  );

  return (
    <section className="space-y-5">
      <PageHeader title={t("AUDIT_TITLE")} />
      <ServerDataTable
        columns={columns}
        error={logs.error}
        getRowId={(row) => row.id}
        isLoading={logs.isLoading}
        page={logs.data}
        query={query}
        searchPlaceholder={t("LOG_SEARCH")}
        toolbar={
          <>
            <Input
              aria-label={t("LOG_ACTION")}
              className="h-9 w-48"
              placeholder={t("LOG_ACTION")}
              value={query.filters.action ?? ""}
              onChange={(event) => query.setFilter("action", event.target.value || undefined)}
            />
            <Input
              aria-label={t("LOG_FROM")}
              className="h-9 w-40"
              type="date"
              value={query.filters.from ?? ""}
              onChange={(event) => query.setFilter("from", event.target.value || undefined)}
            />
            <Input
              aria-label={t("LOG_TO")}
              className="h-9 w-40"
              type="date"
              value={query.filters.to ?? ""}
              onChange={(event) => query.setFilter("to", event.target.value || undefined)}
            />
          </>
        }
      />
      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>
              {viewing?.action} {viewing?.docNo ? `· ${viewing.docNo}` : ""}
            </DialogTitle>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-4 text-xs leading-5">
            {JSON.stringify(viewing?.diff ?? {}, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </section>
  );
}
