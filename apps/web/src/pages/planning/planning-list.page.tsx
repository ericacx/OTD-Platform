import { FileText, Loader2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";

import { RequirePermission } from "@/app/router/guards";
import { StatusBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { ImportPlanningDialog } from "@/features/planning/components/import-planning-dialog";
import { useDictLabel, useDictOptions } from "@/features/planning/dict";
import { usePlanningActionMutation } from "@/features/planning/planning.mutations";
import { usePlanningsQuery } from "@/features/planning/planning.queries";
import { formatDate } from "@/lib/date";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { PlanningDto } from "@/features/planning/planning.types";
import type { ColumnDef } from "@tanstack/react-table";

const SELECT = "h-9 rounded-md border border-input bg-card px-2 text-sm";

function PlanningListView({ archived }: { archived: boolean }) {
  const { t } = useTranslation("planning");
  const { t: tc } = useTranslation();
  const query = useTableQueryState();
  const plannings = usePlanningsQuery(archived, query.params);
  const lookups = useLookups();
  const dict = useDictLabel();
  const categories = useDictOptions("category", ["WOMEN", "MEN", "KIDS"]);
  const archive = usePlanningActionMutation("archive");
  const [importing, setImporting] = useState(false);
  const [toArchive, setToArchive] = useState<PlanningDto | null>(null);

  const columns = useMemo<ColumnDef<PlanningDto, unknown>[]>(
    () => [
      {
        id: "thumb",
        header: t("COL_IMG"),
        cell: ({ row }) =>
          row.original.sourceFile ? (
            <span className="inline-flex size-10 flex-col items-center justify-center rounded-md border border-border bg-danger/5 text-[10px] font-semibold text-danger">
              <FileText aria-hidden="true" className="size-4" />
              PDF
            </span>
          ) : (
            <span className="inline-flex size-10 items-center justify-center rounded-md bg-primary-soft text-xs font-semibold text-primary">
              {row.original.styleNo?.slice(-3) ?? "—"}
            </span>
          ),
      },
      {
        id: "style",
        header: t("COL_STYLE"),
        cell: ({ row }) => (
          <div className="leading-tight">
            <Link className="font-semibold text-primary hover:underline" to={`/planning/${row.original.id}`}>
              {row.original.styleNo ? `#${row.original.styleNo}` : "—"}
            </Link>
            <div className="tabular text-xs text-muted-foreground">{row.original.docNo}</div>
          </div>
        ),
      },
      {
        id: "name",
        header: t("COL_NAME"),
        cell: ({ row }) => (
          <div className="max-w-[280px] leading-tight">
            <div className="truncate font-medium">
              {row.original.status === "RECOGNIZING" ? (
                <span className="text-muted-foreground">{t("RECOGNIZING_NAME")}</span>
              ) : (
                (row.original.nameZh ?? "—")
              )}
            </div>
            <div className="truncate text-xs text-muted-foreground">{row.original.nameEn ?? ""}</div>
          </div>
        ),
      },
      { id: "season", header: t("COL_SEASON"), cell: ({ row }) => row.original.seasonCode ?? "—" },
      { id: "category", header: t("COL_CATEGORY"), cell: ({ row }) => dict("category", row.original.category) },
      { id: "customer", header: t("COL_CUSTOMER"), cell: ({ row }) => row.original.customerName },
      {
        id: "status",
        header: t("COL_STATUS"),
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5">
            <StatusBadge code={row.original.status} machine="planning" />
            {row.original.status === "RECOGNIZING" ? (
              <Loader2 aria-hidden="true" className="size-3 animate-spin text-info" />
            ) : null}
          </span>
        ),
      },
      {
        id: "time",
        header: t("COL_TIME"),
        cell: ({ row }) => (
          <span className="tabular text-muted-foreground">{formatDate(row.original.createdAt, true)}</span>
        ),
      },
      {
        id: "actions",
        header: tc("TBL_ACTIONS"),
        cell: ({ row }) => (
          <div className="flex gap-1 whitespace-nowrap">
            <Button asChild className="h-auto px-1" variant="link">
              <Link to={`/planning/${row.original.id}`}>{t("EDIT")}</Link>
            </Button>
            {!archived && (row.original.status === "EXTRACTED" || row.original.status === "CONFIRMED") ? (
              <RequirePermission code="planning.planning.archive">
                <Button className="h-auto px-1" variant="link" onClick={() => setToArchive(row.original)}>
                  {t("ARCHIVE")}
                </Button>
              </RequirePermission>
            ) : null}
          </div>
        ),
      },
    ],
    [t, tc, dict, archived],
  );

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          archived ? null : (
            <RequirePermission code="planning.planning.create">
              <Button onClick={() => setImporting(true)}>
                <Plus aria-hidden="true" />
                {t("NEW")}
              </Button>
            </RequirePermission>
          )
        }
        title={archived ? t("ARCHIVED_TITLE") : t("LIST_TITLE")}
      />
      <ServerDataTable
        columns={columns}
        error={plannings.error}
        getRowId={(row) => row.id}
        isLoading={plannings.isLoading}
        page={plannings.data}
        query={query}
        searchPlaceholder={t("SEARCH")}
        toolbar={
          <>
            <select
              aria-label={t("COL_SEASON")}
              className={SELECT}
              value={query.filters.seasonCode ?? ""}
              onChange={(e) => query.setFilter("seasonCode", e.target.value || undefined)}
            >
              <option value="">{t("ALL_SEASONS")}</option>
              {(lookups.data?.seasons ?? []).map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code}
                </option>
              ))}
            </select>
            <select
              aria-label={t("COL_CATEGORY")}
              className={SELECT}
              value={query.filters.category ?? ""}
              onChange={(e) => query.setFilter("category", e.target.value || undefined)}
            >
              <option value="">{t("ALL_CATEGORIES")}</option>
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              aria-label={t("COL_CUSTOMER")}
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
            {archived ? null : (
              <select
                aria-label={t("COL_STATUS")}
                className={SELECT}
                value={query.filters.status ?? ""}
                onChange={(e) => query.setFilter("status", e.target.value || undefined)}
              >
                <option value="">{t("ALL_STATUS")}</option>
                {(["RECOGNIZING", "EXTRACTED", "CONFIRMED", "RECOGNITION_FAILED"] as const).map((s) => (
                  <option key={s} value={s}>
                    {t(`ST_${s}`)}
                  </option>
                ))}
              </select>
            )}
          </>
        }
      />
      <ImportPlanningDialog open={importing} onOpenChange={setImporting} />
      <ConfirmDialog
        description={t("ARCHIVE_CONFIRM_DESC", { no: toArchive?.docNo ?? "" })}
        isProcessing={archive.isPending}
        open={toArchive !== null}
        title={t("ARCHIVE_CONFIRM_TITLE")}
        onConfirm={async () => {
          if (!toArchive) return;
          try {
            await archive.mutateAsync({ id: toArchive.id, version: toArchive.version });
            toast.success(t("ARCHIVED_OK"));
          } catch (err) {
            toast.error(err instanceof Error ? err.message : tc("BIZERR"));
          }
          setToArchive(null);
        }}
        onOpenChange={(open) => !open && setToArchive(null)}
      />
    </section>
  );
}

export function PlanningListPage() {
  return <PlanningListView archived={false} />;
}

export function PlanningArchivedPage() {
  return <PlanningListView archived />;
}
