import { pickLabel, moduleByCode, type ModuleCode } from "@otd/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ToneBadge } from "@/components/biz/status-badge";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { usePatrolRunsQuery } from "@/features/patrol/patrol.queries";
import { formatDate } from "@/lib/date";

const PAGE_SIZE = 20;

export function PatrolRunsPage() {
  const { t, i18n } = useTranslation("patrol");
  const [trigger, setTrigger] = useState("");
  const [page, setPage] = useState(1);
  const runs = usePatrolRunsQuery({ trigger: trigger || undefined, page, pageSize: PAGE_SIZE });
  const moduleName = (code: string) => {
    try {
      return pickLabel(moduleByCode(code as ModuleCode).label, i18n.language);
    } catch {
      return code;
    }
  };
  const statusTone = (s: string) => (s === "DONE" ? "success" : s === "FAILED" ? "danger" : "info");
  const statusText = (s: string) => (s === "DONE" ? t("RUN_STATUS_DONE") : s === "FAILED" ? t("RUN_STATUS_FAILED") : t("RUN_STATUS_RUNNING"));
  const data = runs.data;

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <select
            aria-label={t("RUN_TRIGGER")}
            className="h-9 rounded-md border border-input bg-card px-2 text-sm"
            value={trigger}
            onChange={(e) => {
              setTrigger(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{`${t("RUN_TRIGGER")} · ${t("ALL")}`}</option>
            <option value="AUTO">{t("TRIGGER_AUTO")}</option>
            <option value="MANUAL">{t("TRIGGER_MANUAL")}</option>
          </select>
        }
        title={t("RUNS_TITLE")}
      />
      {runs.isLoading ? (
        <LoadingState />
      ) : runs.error ? (
        <ErrorState error={runs.error} />
      ) : !data?.items.length ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{t("EMPTY_RUNS")}</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius)] border border-border bg-card shadow-xs">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th className="h-11 px-4 font-medium">{t("RUN_NO")}</th>
                <th className="px-4 font-medium">{t("RUN_TRIGGER")}</th>
                <th className="px-4 font-medium">{t("RUN_STARTED")}</th>
                <th className="px-4 font-medium">{t("RUN_DURATION")}</th>
                <th className="px-4 font-medium">{t("RUN_RULES")}</th>
                <th className="px-4 font-medium">{t("RUN_HITS")}</th>
                <th className="px-4 font-medium">{t("RUN_RED_YELLOW")}</th>
                <th className="px-4 font-medium">{t("RUN_GREEN")}</th>
                <th className="px-4 font-medium">{t("RUN_BY")}</th>
                <th className="px-4 font-medium">{t("RUN_STATUS")}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((run) => (
                <tr className="border-t border-border" key={run.id}>
                  <td className="tabular px-4 py-3 font-semibold">{run.docNo}</td>
                  <td className="px-4">{run.trigger === "MANUAL" ? t("TRIGGER_MANUAL") : t("TRIGGER_AUTO")}</td>
                  <td className="tabular px-4 whitespace-nowrap">{formatDate(run.startedAt, true)}</td>
                  <td className="tabular px-4">{run.durationMs === null ? "—" : t("MS", { ms: run.durationMs })}</td>
                  <td className="tabular px-4">{run.ruleCount}</td>
                  <td className="tabular px-4 font-medium">{run.hitCount}</td>
                  <td className="tabular px-4">
                    <span className="text-danger">{run.redCount}</span> / <span className="text-warning">{run.yellowCount}</span>
                  </td>
                  <td className="px-4 text-xs">{run.greenModules.length ? run.greenModules.map(moduleName).join("、") : "—"}</td>
                  <td className="px-4">{run.triggeredByName ?? t("SYSTEM")}</td>
                  <td className="px-4">
                    <ToneBadge label={statusText(run.status)} tone={statusTone(run.status)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.total > PAGE_SIZE ? (
            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2">
              <Button disabled={page <= 1} size="sm" variant="outline" onClick={() => setPage(page - 1)}>
                {t("PREV")}
              </Button>
              <Button disabled={page * PAGE_SIZE >= data.total} size="sm" variant="outline" onClick={() => setPage(page + 1)}>
                {t("NEXT")}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
