import { FORCED_NODES } from "@otd/contracts/flow";
import { NODES, pickLabel } from "@otd/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

import { useHasPermission } from "@/app/providers/auth-provider";
import { ToneBadge } from "@/components/biz/status-badge";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AddModuleDialog } from "@/features/flow/components/add-module-dialog";
import { CopyFlowDialog } from "@/features/flow/components/copy-flow-dialog";
import { DEPARTMENTS, errorText } from "@/features/flow/components/flow-labels";
import { FlowModuleRow } from "@/features/flow/components/flow-module-row";
import { FlowParamsCard } from "@/features/flow/components/flow-params-card";
import { MigrationDialog } from "@/features/flow/components/migration-dialog";
import { NodeStrip } from "@/features/flow/components/node-strip";
import { PublishDialog } from "@/features/flow/components/publish-dialog";
import { VersionsSheet } from "@/features/flow/components/versions-sheet";
import { useSaveDraftMutation } from "@/features/flow/flow.mutations";
import {
  fetchServiceModule,
  useFlowCardsQuery,
  useFlowDetailQuery,
  useServiceModulesQuery,
} from "@/features/flow/flow.queries";
import { formatDate } from "@/lib/date";

import type { DraftModule, FlowDetailDto, FlowModuleView } from "@/features/flow/flow.types";

function toDraft(views: FlowModuleView[]): DraftModule[] {
  return views.map((m) => ({
    moduleCode: m.moduleCode,
    department: m.department,
    items: m.items
      .filter((i) => i.enabled && !i.deleted)
      .map((i) => (i.params ? { itemCode: i.code, params: i.params } : { itemCode: i.code })),
  }));
}

export function CustomerFlowPage() {
  const { customerId = "" } = useParams();
  const { t, i18n } = useTranslation("flow");
  const { t: tc } = useTranslation();
  const detail = useFlowDetailQuery(customerId);
  const catalog = useServiceModulesQuery({ pageSize: 100 });
  const queryClient = useQueryClient();
  const save = useSaveDraftMutation(customerId);
  const canEdit = useHasPermission("flow.customer.edit");
  const canPublish = useHasPermission("flow.customer.publish");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [diffMode, setDiffMode] = useState<"compare" | "publish" | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [showMigration, setShowMigration] = useState(false);
  const [showCopy, setShowCopy] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const cards = useFlowCardsQuery({ pageSize: 200 });

  if (detail.isLoading) return <LoadingState />;
  if (detail.error || !detail.data) return <ErrorState error={detail.error} />;
  const data: FlowDetailDto = detail.data;
  const views = data.draft.modules;
  const busy = save.isPending;
  const customer = data.customer;

  async function persist(modules: DraftModule[], params: Record<string, unknown> = data.draft.params) {
    setError(null);
    try {
      await save.mutateAsync({ modules, params, version: data.version });
    } catch (err) {
      setError(errorText(err, tc("BIZERR")));
      await detail.refetch();
    }
  }

  function reorder(from: number, to: number) {
    if (from === to || to < 0 || to >= views.length) return;
    const next = [...toDraft(views)];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    void persist(next);
  }

  function update(index: number, change: (m: DraftModule, view: FlowModuleView) => DraftModule) {
    const next = toDraft(views).map((m, i) => (i === index ? change(m, views[i]!) : m));
    void persist(next);
  }

  async function addModule(moduleCode: string) {
    const ref = catalog.data?.items.find((m) => m.code === moduleCode);
    if (!ref) return;
    setError(null);
    try {
      const mod = await fetchServiceModule(queryClient, ref.id);
      await persist([
        ...toDraft(views),
        { moduleCode, department: mod.department, items: mod.items.map((i) => ({ itemCode: i.code })) },
      ]);
      setAdding(false);
    } catch (err) {
      setError(errorText(err, tc("BIZERR")));
    }
  }

  const current = data.currentVersion;
  const sources = (cards.data?.items ?? []).filter((c) => c.moduleCount > 0);
  const lang = i18n.language;
  const missingForced = FORCED_NODES.filter((n) => !data.draftRuntime.nodes.includes(n)).map((n) => {
    const def = NODES.find((x) => x.code === n);
    return def ? `${n} ${pickLabel(def.label, lang)}` : n;
  });

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <>
            <Button variant="outline" onClick={() => setDiffMode("compare")}>
              {t("COMPARE")}
            </Button>
            <Button variant="outline" onClick={() => setShowVersions(true)}>
              {t("VERSIONS")}
            </Button>
            {canEdit ? (
              <Button variant="outline" onClick={() => setShowCopy(true)}>
                {t("COPY_FROM")}
              </Button>
            ) : null}
            {canPublish ? (
              <Button disabled={!current} variant="outline" onClick={() => setShowMigration(true)}>
                {t("MIGRATE")}
              </Button>
            ) : null}
            {canEdit ? (
              <Button
                disabled={busy || !data.availableModules.length}
                variant="outline"
                onClick={() => setAdding(true)}
              >
                <Plus aria-hidden="true" className="size-4" />
                {t("ADD_MODULE")}
              </Button>
            ) : null}
            {canPublish ? (
              <Button
                disabled={busy || !data.hasChanges || missingForced.length > 0}
                title={missingForced.length ? t("FORCED_MISSING", { nodes: missingForced.join("、") }) : undefined}
                onClick={() => setDiffMode("publish")}
              >
                {t("PUBLISH")}
              </Button>
            ) : null}
          </>
        }
        crumbs={[
          { label: t("CRUMB_CONFIG") },
          { label: t("FLOWS_TITLE"), to: "/flow/customers" },
          { label: customer.name },
        ]}
        title={`${t("FLOW_OF")} · ${customer.name}`}
      />
      <div className="flex flex-wrap items-center gap-4 rounded-[var(--radius)] border border-border bg-card p-4 shadow-xs">
        <div className="flex h-12 min-w-24 items-center justify-center rounded-md bg-primary-soft px-3 text-sm font-bold text-primary">
          {customer.logoText ?? customer.code}
        </div>
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{customer.name}</span>
            <span className="text-muted-foreground">
              {customer.code} · {customer.contactName ?? "—"} · {t("TERMS", { days: customer.paymentTermsDays })}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {current ? (
              <>
                <ToneBadge label={t("FLOW_PUBLISHED", { no: current.versionNo })} tone="info" />
                <span>
                  {t("PUBLISHED_AT", { at: formatDate(current.publishedAt, true), by: current.publishedByName ?? "—" })}
                </span>
              </>
            ) : (
              <ToneBadge label={t("FLOW_NOT_PUBLISHED")} />
            )}
            {data.hasChanges ? <ToneBadge label={t("HAS_CHANGES")} tone="warning" /> : null}
            {busy ? <span>{tc("SBWT01")}</span> : null}
          </div>
        </div>
        <div className="text-right text-sm">
          <span className="tabular font-semibold">{views.length}</span> {t("MODULES_UNIT")} ·{" "}
          <span className="tabular font-semibold">{views.reduce((n, m) => n + m.enabledCount, 0)}</span>{" "}
          {t("ITEMS_UNIT_LONG")}
        </div>
      </div>
      <Alert>
        <AlertDescription>{t("FLOW_NOTE")}</AlertDescription>
      </Alert>
      {missingForced.length ? (
        <Alert variant="destructive">
          <AlertDescription>{t("FORCED_MISSING", { nodes: missingForced.join("、") })}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <NodeStrip runtime={data.draftRuntime} />
          {views.length ? (
            <ol aria-label={t("MODULE_LIST")} className="space-y-2">
              {views.map((view, index) => (
                <FlowModuleRow
                  busy={busy}
                  canEdit={canEdit}
                  departments={DEPARTMENTS}
                  dragOver={overIndex === index && dragIndex !== null && dragIndex !== index}
                  index={index}
                  key={view.moduleCode}
                  total={views.length}
                  view={view}
                  onDepartment={(department) => update(index, (m) => ({ ...m, department }))}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  onDragOver={(event) => {
                    if (dragIndex === null) return;
                    event.preventDefault();
                    setOverIndex(index);
                  }}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    setDragIndex(index);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragIndex !== null) reorder(dragIndex, index);
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  onMove={(delta) => reorder(index, index + delta)}
                  onRemove={() => void persist(toDraft(views).filter((_, i) => i !== index))}
                  onToggle={(itemCode) =>
                    update(index, (m, v) => {
                      const enabled = m.items.some((i) => i.itemCode === itemCode);
                      const order = v.items.map((i) => i.code);
                      const items = enabled
                        ? m.items.filter((i) => i.itemCode !== itemCode)
                        : [...m.items, { itemCode }];
                      return {
                        ...m,
                        items: items.sort((a, b) => order.indexOf(a.itemCode) - order.indexOf(b.itemCode)),
                      };
                    })
                  }
                />
              ))}
            </ol>
          ) : (
            <EmptyState description={t("EMPTY_FLOW_HINT")} title={t("EMPTY_FLOW")} />
          )}
        </div>
        <FlowParamsCard
          busy={busy}
          canEdit={canEdit}
          key={data.version}
          params={data.draft.params}
          onSave={(params) => void persist(toDraft(views), params)}
        />
      </div>
      <AddModuleDialog
        busy={busy}
        customerName={customer.name}
        modules={data.availableModules}
        open={adding}
        onOpenChange={setAdding}
        onPick={(code) => void addModule(code)}
      />
      <PublishDialog
        customerId={customerId}
        mode={diffMode ?? "compare"}
        nextVersionNo={(current?.versionNo ?? 0) + 1}
        open={diffMode !== null}
        version={data.version}
        onOpenChange={(open) => !open && setDiffMode(null)}
      />
      <VersionsSheet
        canRollback={canPublish}
        customerId={customerId}
        open={showVersions}
        version={data.version}
        onOpenChange={setShowVersions}
      />
      <MigrationDialog customerId={customerId} open={showMigration} onOpenChange={setShowMigration} />
      <CopyFlowDialog
        customerId={customerId}
        open={showCopy}
        sources={sources}
        version={data.version}
        onOpenChange={setShowCopy}
      />
    </section>
  );
}
