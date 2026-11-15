import { Download, Paperclip } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/app/providers/auth-provider";
import { RequirePermission } from "@/app/router/guards";
import { ToneBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { KbFormDialog } from "@/features/document/components/kb-form-dialog";
import { useKbDocumentsQuery } from "@/features/document/document.queries";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { downloadFile } from "@/features/quote/quote.mutations";
import { formatDate } from "@/lib/date";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { KbDocumentDto, KbKind } from "@/features/document/document.types";
import type { ColumnDef } from "@tanstack/react-table";

const SELECT = "h-9 rounded-md border border-input bg-card px-2 text-sm";

function KnowledgePage({ kind }: { kind: KbKind }) {
  const { t } = useTranslation("document");
  const { t: tc } = useTranslation();
  const { hasPermission } = useAuth();
  const query = useTableQueryState();
  const docs = useKbDocumentsQuery({ ...query.params, kind });
  const lookups = useLookups();
  const [editing, setEditing] = useState<KbDocumentDto | null | undefined>(undefined);
  const [viewing, setViewing] = useState<KbDocumentDto | null>(null);
  const [tag, setTag] = useState(query.filters.tag ?? "");
  const prefix = kind === "MANUAL" ? "MANUAL" : "KB";
  const editPermission = kind === "MANUAL" ? "document.manual.edit" : "document.kb.edit";
  const canEdit = hasPermission(editPermission);

  const columns = useMemo<ColumnDef<KbDocumentDto, unknown>[]>(
    () => [
      {
        id: "title",
        header: t("TITLE"),
        cell: ({ row }) => (
          <span className="block max-w-xl leading-tight">
            <span className="block font-medium">{row.original.title}</span>
            <span className="block truncate text-xs text-muted-foreground">{row.original.excerpt}</span>
          </span>
        ),
      },
      { id: "customer", header: t("CUSTOMER"), cell: ({ row }) => row.original.customerName ?? t("GENERAL") },
      {
        id: "tags",
        header: t("TAGS"),
        cell: ({ row }) => (
          <span className="flex flex-wrap gap-1">
            {row.original.tags.map((item) => (
              <ToneBadge key={item} label={item} />
            ))}
          </span>
        ),
      },
      {
        id: "file",
        header: t("ATTACHMENT"),
        cell: ({ row }) =>
          row.original.file ? (
            <span className="inline-flex items-center gap-1 text-sm">
              <Paperclip aria-hidden="true" className="size-3.5" />
              {row.original.file.filename}
            </span>
          ) : (
            "—"
          ),
      },
      { id: "editor", header: t("UPDATED_BY"), cell: ({ row }) => row.original.updatedByName ?? "—" },
      {
        id: "updated",
        header: t("UPDATED"),
        cell: ({ row }) => <span className="tabular text-muted-foreground">{formatDate(row.original.updatedAt)}</span>,
      },
      {
        id: "actions",
        header: tc("TBL_ACTIONS"),
        cell: ({ row }) => (
          <span className="flex gap-2" onClick={(e) => e.stopPropagation()} role="presentation">
            <Button className="h-auto px-0" variant="link" onClick={() => setViewing(row.original)}>
              {t("VIEW")}
            </Button>
            {canEdit ? (
              <Button className="h-auto px-0" variant="link" onClick={() => setEditing(row.original)}>
                {tc("1VV96U")}
              </Button>
            ) : null}
          </span>
        ),
      },
    ],
    [t, tc, canEdit],
  );

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code={editPermission}>
            <Button onClick={() => setEditing(null)}>{t(`${prefix}_NEW`)}</Button>
          </RequirePermission>
        }
        description={t(`${prefix}_DESC`)}
        title={t(`${prefix}_TITLE`)}
      />
      <ServerDataTable
        columns={columns}
        error={docs.error}
        getRowId={(row) => row.id}
        isLoading={docs.isLoading}
        page={docs.data}
        query={query}
        searchPlaceholder={t("KB_SEARCH")}
        toolbar={
          <>
            {kind === "MANUAL" ? (
              <select
                aria-label={t("CUSTOMER")}
                className={SELECT}
                value={query.filters.customerId ?? ""}
                onChange={(e) => query.setFilter("customerId", e.target.value || undefined)}
              >
                <option value="">{t("ALL_CUSTOMERS")}</option>
                {(lookups.data?.customers ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : null}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                query.setFilter("tag", tag.trim() || undefined);
              }}
            >
              <Input
                aria-label={t("TAG_FILTER")}
                className="h-9 w-40"
                placeholder={t("TAG_FILTER")}
                value={tag}
                onChange={(e) => setTag(e.target.value)}
              />
            </form>
          </>
        }
        onRowClick={(row) => setViewing(row)}
      />
      <KbFormDialog
        doc={editing ?? null}
        kind={kind}
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
      />
      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
          {viewing ? (
            <>
              <DialogHeader>
                <DialogTitle>{viewing.title}</DialogTitle>
                <DialogDescription>
                  {[viewing.customerName ?? t("GENERAL"), viewing.updatedByName, formatDate(viewing.updatedAt)]
                    .filter(Boolean)
                    .join(" · ")}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap gap-1">
                {viewing.tags.map((item) => (
                  <ToneBadge key={item} label={item} />
                ))}
              </div>
              <article className="text-sm leading-relaxed whitespace-pre-wrap">
                {viewing.content || t("NO_CONTENT")}
              </article>
              {viewing.file ? (
                <Button
                  className="w-fit"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const file = viewing.file;
                    if (file) void downloadFile(file.id, file.filename, file.contentType);
                  }}
                >
                  <Download aria-hidden="true" className="size-4" />
                  {viewing.file.filename}
                </Button>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function ManualsPage() {
  return <KnowledgePage kind="MANUAL" />;
}

export function KnowledgeBasePage() {
  return <KnowledgePage kind="KB" />;
}
