import { AlertTriangle, Clock, Gauge, Layers, Plus, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

import { useAuth } from "@/app/providers/auth-provider";
import { RequirePermission } from "@/app/router/guards";
import { SectionCard } from "@/components/biz/detail-header-card";
import { KpiCard } from "@/components/biz/kpi-card";
import { StatusBadge } from "@/components/biz/status-badge";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useCreateVersionMutation,
  useDeleteRowMutation,
  usePublishVersionMutation,
} from "@/features/capacity/capacity.mutations";
import {
  useCapacityCompareQuery,
  useCapacityDetailQuery,
  useCapacityVersionsQuery,
  useLedgerTasksQuery,
} from "@/features/capacity/capacity.queries";
import { BacklogDialog, KnitRowDialog, ManualRowDialog } from "@/features/capacity/components/capacity-dialogs";
import { FormulaNote } from "@/features/capacity/components/formula-note";
import { KnitTable, percent } from "@/features/capacity/components/knit-table";
import { MachinesDialog } from "@/features/capacity/components/machines-dialog";
import { PackingTable, SpecialTable } from "@/features/capacity/components/manual-tables";
import { TasksTable } from "@/features/capacity/components/tasks-table";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { formatDate } from "@/lib/date";

import { useTaskActions } from "./use-task-actions";

import type { CapacityRowDto, Ledger } from "@/features/capacity/capacity.types";

const LEDGERS: Ledger[] = ["KNIT", "PACKING", "SPECIAL"];

export function CapacityLedgerPage() {
  const { t } = useTranslation("capacity");
  const { hasPermission } = useAuth();
  const [params, setParams] = useSearchParams();
  const versions = useCapacityVersionsQuery();
  const lookups = useLookups();
  const tasks = useLedgerTasksQuery();
  const taskActions = useTaskActions();
  const createVersion = useCreateVersionMutation();
  const publish = usePublishVersionMutation();
  const deleteRow = useDeleteRowMutation();

  const selectedId = params.get("v") ?? versions.data?.[0]?.id;
  const compareId = params.get("cmp") ?? undefined;
  const tab = (LEDGERS.includes(params.get("tab") as Ledger) ? params.get("tab") : "KNIT") as Ledger;
  const keyword = params.get("q") ?? "";
  const [search, setSearch] = useState(keyword);
  const detail = useCapacityDetailQuery(selectedId, keyword);
  const compare = useCapacityCompareQuery(compareId, selectedId);

  const [pending, setPending] = useState<"create" | "publish" | null>(null);
  const [machinesOpen, setMachinesOpen] = useState(false);
  const [editKnit, setEditKnit] = useState<CapacityRowDto | null>(null);
  const [editBacklog, setEditBacklog] = useState<CapacityRowDto | null>(null);
  const [manual, setManual] = useState<{ row: CapacityRowDto | null } | null>(null);
  const [removing, setRemoving] = useState<CapacityRowDto | null>(null);

  const setParam = (key: string, value: string | undefined) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  if (versions.isLoading) return <LoadingState className="m-6" />;
  if (versions.error) return <ErrorState error={versions.error} />;

  const current = versions.data?.find((v) => v.id === selectedId);
  const draft = current?.status === "DRAFT";
  const canEdit = draft && hasPermission("capacity.ledger.edit");
  const rows = detail.data?.rows ?? [];
  const kpis = detail.data?.kpis;
  const baseCount = new Set(rows.filter((r) => r.ledger === "KNIT").map((r) => r.baseId)).size;
  const run = async (work: () => Promise<unknown>, done: string) => {
    try {
      await work();
      toast.success(done);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("FAILED"));
    } finally {
      setPending(null);
      setRemoving(null);
    }
  };

  const versionLabel = (v: { label: string; asOfDate: string }) => `${v.label}（${formatDate(v.asOfDate)}）`;

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <>
            <select
              aria-label={t("VERSION")}
              className="h-9 rounded-md border border-input bg-card px-2 text-sm"
              value={selectedId ?? ""}
              onChange={(event) => setParam("v", event.target.value || undefined)}
            >
              {(versions.data ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {t("VERSION_OPTION", {
                    label: versionLabel(v),
                    status: v.status === "DRAFT" ? t("V_DRAFT") : t("V_PUBLISHED"),
                  })}
                </option>
              ))}
            </select>
            <select
              aria-label={t("COMPARE")}
              className="h-9 rounded-md border border-input bg-card px-2 text-sm"
              value={compareId ?? ""}
              onChange={(event) => setParam("cmp", event.target.value || undefined)}
            >
              <option value="">{t("COMPARE_NONE")}</option>
              {(versions.data ?? [])
                .filter((v) => v.id !== selectedId)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {t("COMPARE_WITH", { label: versionLabel(v) })}
                  </option>
                ))}
            </select>
            <RequirePermission code="capacity.ledger.edit">
              <Button variant="outline" onClick={() => setMachinesOpen(true)}>
                {t("MACHINES_TITLE")}
              </Button>
              <Button variant="outline" onClick={() => setPending("create")}>
                <Plus aria-hidden="true" className="size-4" />
                {t("VERSION_NEW")}
              </Button>
            </RequirePermission>
            {draft && current ? (
              <RequirePermission code="capacity.ledger.publish">
                <Button onClick={() => setPending("publish")}>{t("PUBLISH")}</Button>
              </RequirePermission>
            ) : null}
          </>
        }
        title={t("LEDGER_TITLE")}
      />
      {!current ? (
        <EmptyState description={t("NO_VERSION_DESC")} icon={Layers} title={t("NO_VERSION")} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={tab} onValueChange={(v) => setParam("tab", v === "KNIT" ? undefined : v)}>
              <TabsList>
                {LEDGERS.map((l) => (
                  <TabsTrigger key={l} value={l}>
                    {t(`TAB_${l}`)}
                    <span className="ml-1.5 rounded bg-muted px-1.5 text-xs text-muted-foreground">
                      {current.rowCounts[l]}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <StatusBadge code={current.status} machine="capacityVersion" />
            {current.publishedAt ? (
              <span className="text-xs text-muted-foreground">
                {t("PUBLISHED_META", { by: current.publishedByName ?? "—", at: formatDate(current.publishedAt, true) })}
              </span>
            ) : null}
            <form
              className="relative ml-auto"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                setParam("q", search.trim() || undefined);
              }}
            >
              <Search
                aria-hidden="true"
                className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label={t("SEARCH")}
                className="h-9 w-56 pl-8"
                placeholder={t("SEARCH")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </form>
          </div>
          {kpis ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                hint={t("KPI_SPARE_HINT", { label: current.label, bases: baseCount })}
                icon={Layers}
                label={t("KPI_SPARE")}
                tone="primary"
                unit={t("WAN_PAIRS")}
                value={kpis.groupSpareWan.toLocaleString(undefined, {
                  maximumFractionDigits: 1,
                  minimumFractionDigits: 1,
                })}
              />
              <KpiCard
                hint={t("KPI_RATE_HINT")}
                icon={Gauge}
                label={t("KPI_RATE")}
                value={percent(kpis.avgSpareRate)}
              />
              <KpiCard
                hint={t("KPI_TIGHT_HINT", { rate: Math.round(kpis.tightThreshold * 100) })}
                icon={AlertTriangle}
                label={t("KPI_TIGHT")}
                tone={kpis.tightCount ? "danger" : "default"}
                unit={t("UNIT_ITEMS")}
                value={kpis.tightCount}
              />
              <KpiCard
                hint={t("KPI_OVERDUE_HINT")}
                icon={Clock}
                label={t("KPI_OVERDUE")}
                tone={kpis.overdueTasks ? "warning" : "default"}
                unit={t("UNIT_ITEMS")}
                value={kpis.overdueTasks}
                to="/capacity/tasks"
              />
            </div>
          ) : null}
          <SectionCard bodyClassName="p-0" title={t("TASKS_TITLE")}>
            <TasksTable
              canAct={taskActions.canAct}
              tasks={tasks.data ?? []}
              onComplete={taskActions.onComplete}
              onStart={taskActions.onStart}
            />
          </SectionCard>
          <SectionCard
            bodyClassName={tab === "KNIT" ? "space-y-4" : "p-0"}
            extra={
              tab !== "KNIT" && canEdit ? (
                <Button size="sm" variant="outline" onClick={() => setManual({ row: null })}>
                  <Plus aria-hidden="true" className="size-4" />
                  {t("ROW_ADD")}
                </Button>
              ) : compare.data ? (
                t("COMPARING", { from: compare.data.from.label, to: compare.data.to.label })
              ) : null
            }
            title={t(`TAB_${tab}`)}
          >
            {detail.isLoading ? (
              <LoadingState />
            ) : detail.error ? (
              <ErrorState error={detail.error} />
            ) : tab === "KNIT" ? (
              <>
                <FormulaNote windowDays={current.windowDays} />
                <KnitTable
                  compare={compare.data}
                  editable={Boolean(canEdit)}
                  rows={rows.filter((r) => r.ledger === "KNIT")}
                  onBacklog={setEditBacklog}
                  onEdit={setEditKnit}
                />
              </>
            ) : tab === "PACKING" ? (
              <PackingTable
                editable={Boolean(canEdit)}
                rows={rows.filter((r) => r.ledger === "PACKING")}
                onDelete={setRemoving}
                onEdit={(row) => setManual({ row })}
              />
            ) : (
              <SpecialTable
                editable={Boolean(canEdit)}
                rows={rows.filter((r) => r.ledger === "SPECIAL")}
                onDelete={setRemoving}
                onEdit={(row) => setManual({ row })}
              />
            )}
          </SectionCard>
        </>
      )}
      {taskActions.dialog}
      <MachinesDialog open={machinesOpen} onOpenChange={setMachinesOpen} />
      <KnitRowDialog row={editKnit} onClose={() => setEditKnit(null)} />
      <BacklogDialog row={editBacklog} onClose={() => setEditBacklog(null)} />
      {current && tab !== "KNIT" ? (
        <ManualRowDialog
          bases={lookups.data?.bases ?? []}
          ledger={tab}
          open={manual !== null}
          row={manual?.row ?? null}
          versionId={current.id}
          onClose={() => setManual(null)}
        />
      ) : null}
      <ConfirmDialog
        description={t("VERSION_NEW_DESC")}
        isProcessing={createVersion.isPending}
        open={pending === "create"}
        title={t("VERSION_NEW")}
        onConfirm={() =>
          run(async () => {
            const created = await createVersion.mutateAsync({});
            setParam("v", created.version.id);
          }, t("DONE_VERSION_NEW"))
        }
        onOpenChange={(open) => !open && setPending(null)}
      />
      <ConfirmDialog
        description={current ? t("PUBLISH_DESC", { label: current.label }) : undefined}
        isProcessing={publish.isPending}
        open={pending === "publish"}
        title={t("PUBLISH")}
        onConfirm={() =>
          run(() => publish.mutateAsync({ id: current!.id, version: current!.version }), t("DONE_PUBLISH"))
        }
        onOpenChange={(open) => !open && setPending(null)}
      />
      <ConfirmDialog
        description={t("ROW_DELETE_DESC", { base: removing?.baseName ?? "" })}
        isProcessing={deleteRow.isPending}
        open={removing !== null}
        title={t("ROW_DELETE")}
        variant="destructive"
        onConfirm={() =>
          run(() => deleteRow.mutateAsync({ id: removing!.id, version: removing!.version }), t("DONE_ROW_DELETE"))
        }
        onOpenChange={(open) => !open && setRemoving(null)}
      />
    </section>
  );
}
