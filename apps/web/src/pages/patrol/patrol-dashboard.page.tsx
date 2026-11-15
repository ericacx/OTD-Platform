import { SEVERITIES, pickLabel, statusLabel } from "@otd/shared";
import { Activity, ListChecks, Radar } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";

import { useHasPermission } from "@/app/providers/auth-provider";
import { RequirePermission } from "@/app/router/guards";
import { KpiCard } from "@/components/biz/kpi-card";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { CloseHitDialog } from "@/features/patrol/components/close-hit-dialog";
import { HitsTable } from "@/features/patrol/components/hits-table";
import { PatrolLegend } from "@/features/patrol/components/patrol-legend";
import { useHandleHitMutation, useRunPatrolMutation } from "@/features/patrol/patrol.mutations";
import { usePatrolDashboardQuery } from "@/features/patrol/patrol.queries";
import { formatDate } from "@/lib/date";
import { BizError } from "@/lib/http/errors";

import type { PatrolHitDto } from "@otd/contracts/patrol";

const PAGE_SIZE = 20;
const selectClass = "h-9 rounded-md border border-input bg-card px-2 text-sm";

export function PatrolDashboardPage() {
  const { t, i18n } = useTranslation("patrol");
  const [module, setModule] = useState("");
  const [light, setLight] = useState("");
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [closing, setClosing] = useState<PatrolHitDto | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const canHandle = useHasPermission("patrol.dashboard.view");
  const query = usePatrolDashboardQuery({ module: module || undefined, light: light || undefined, severity: severity || undefined, status: status || undefined, page, pageSize: PAGE_SIZE });
  const run = useRunPatrolMutation();
  const handle = useHandleHitMutation();
  const data = query.data;

  const filter = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  async function runNow() {
    try {
      const result = await run.mutateAsync();
      if (result.alreadyRunning) toast.info(t("RUN_ALREADY", { docNo: result.docNo }));
      else toast.success(t("RUN_DONE", { docNo: result.docNo, rules: result.ruleCount, hits: result.hitCount }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("FAILED"));
    }
  }

  async function act(hit: PatrolHitDto, action: "START" | "CLOSE", note?: string) {
    try {
      await handle.mutateAsync({ id: hit.id, input: { action, version: hit.version, ...(note ? { note } : {}) } });
      toast.success(action === "START" ? t("HANDLED_START") : t("HANDLED_CLOSE"));
      setClosing(null);
      setCloseError(null);
    } catch (err) {
      const message = err instanceof BizError && err.code === "COMMON_VERSION_CONFLICT" ? t("VERSION_CONFLICT") : err instanceof Error ? err.message : t("FAILED");
      if (action === "CLOSE") setCloseError(message);
      else toast.error(message);
    }
  }

  const lastRun = data?.lastRun ?? null;
  const triggerLabel = (trigger: string) => (trigger === "MANUAL" ? t("TRIGGER_MANUAL") : t("TRIGGER_AUTO"));

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <>
            <RequirePermission code="patrol.rule.view">
              <Button asChild variant="outline">
                <Link to="/patrol/rules">{t("RULES_TITLE")}</Link>
              </Button>
            </RequirePermission>
            <RequirePermission code="patrol.dashboard.run">
              <Button disabled={run.isPending} onClick={() => void runNow()}>
                <Radar aria-hidden="true" className={run.isPending ? "size-4 animate-spin" : "size-4"} />
                {run.isPending ? t("RUNNING") : t("RUN_NOW")}
              </Button>
            </RequirePermission>
          </>
        }
        title={t("DASHBOARD_TITLE")}
      />
      {query.isLoading ? (
        <LoadingState />
      ) : query.error ? (
        <ErrorState error={query.error} />
      ) : data ? (
        <>
          <PatrolLegend legend={data.legend} />
          <div className="grid gap-4 md:grid-cols-3">
            <KpiCard hint={t("KPI_RULES_HINT", { total: data.kpis.totalRules, modules: data.kpis.coveredModules })} icon={ListChecks} label={t("KPI_RULES")} tone="primary" unit={t("UNIT_ITEMS")} value={data.kpis.activeRules} />
            <KpiCard hint={data.kpis.lastRunAt ? t("KPI_HITS_HINT", { time: formatDate(data.kpis.lastRunAt, true) }) : t("NO_RUN")} icon={Activity} label={t("KPI_HITS")} tone="danger" unit={t("UNIT_HITS")} value={data.kpis.hitCount} />
            <KpiCard
              hint={lastRun ? t("KPI_RUN_HINT", { trigger: triggerLabel(lastRun.trigger), ms: lastRun.durationMs ?? 0 }) : t("NO_RUN")}
              icon={Radar}
              label={t("KPI_RUN")}
              tone="primary"
              value={data.running?.docNo ?? lastRun?.docNo ?? "—"}
            />
          </div>
          <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 className="font-medium">{t("HITS_TITLE")}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <select aria-label={t("FILTER_MODULE")} className={selectClass} value={module} onChange={(e) => filter(setModule)(e.target.value)}>
                  <option value="">{`${t("FILTER_MODULE")} · ${t("ALL")}`}</option>
                  {data.modules.map((m) => (
                    <option key={m.code} value={m.code}>{`${pickLabel(m.label, i18n.language)}（${m.open}）`}</option>
                  ))}
                </select>
                <select aria-label={t("FILTER_LIGHT")} className={selectClass} value={light} onChange={(e) => filter(setLight)(e.target.value)}>
                  <option value="">{`${t("FILTER_LIGHT")} · ${t("ALL")}`}</option>
                  <option value="RED">{t("LEGEND_RED")}</option>
                  <option value="YELLOW">{t("LEGEND_YELLOW")}</option>
                </select>
                <select aria-label={t("FILTER_SEVERITY")} className={selectClass} value={severity} onChange={(e) => filter(setSeverity)(e.target.value)}>
                  <option value="">{`${t("FILTER_SEVERITY")} · ${t("ALL")}`}</option>
                  {(["HIGH", "MEDIUM", "LOW"] as const).map((s) => (
                    <option key={s} value={s}>{pickLabel(SEVERITIES[s].label, i18n.language)}</option>
                  ))}
                </select>
                <select aria-label={t("FILTER_STATUS")} className={selectClass} value={status} onChange={(e) => filter(setStatus)(e.target.value)}>
                  <option value="">{t("STATUS_UNCLOSED")}</option>
                  {(["OPEN", "HANDLING", "CLOSED"] as const).map((s) => (
                    <option key={s} value={s}>{pickLabel(statusLabel("patrolHit", s), i18n.language)}</option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">{t("HITS_SHOWING", { shown: data.hits.items.length, total: data.hits.total })}</span>
              </div>
            </div>
            <HitsTable
              canHandle={canHandle}
              hits={data.hits.items}
              pendingId={handle.isPending ? (handle.variables?.id ?? null) : null}
              onClose={(hit) => {
                setCloseError(null);
                setClosing(hit);
              }}
              onStart={(hit) => void act(hit, "START")}
            />
            {data.hits.total > PAGE_SIZE ? (
              <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2">
                <Button disabled={page <= 1} size="sm" variant="outline" onClick={() => setPage(page - 1)}>
                  {t("PREV")}
                </Button>
                <span className="tabular text-xs text-muted-foreground">{`${page} / ${Math.ceil(data.hits.total / PAGE_SIZE)}`}</span>
                <Button disabled={page * PAGE_SIZE >= data.hits.total} size="sm" variant="outline" onClick={() => setPage(page + 1)}>
                  {t("NEXT")}
                </Button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
      <CloseHitDialog
        error={closeError}
        hit={closing}
        pending={handle.isPending}
        onCancel={() => {
          setClosing(null);
          setCloseError(null);
        }}
        onConfirm={(note) => closing && void act(closing, "CLOSE", note)}
      />
    </section>
  );
}
