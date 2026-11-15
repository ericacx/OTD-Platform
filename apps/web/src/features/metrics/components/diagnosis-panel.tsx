import { RefreshCw, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ToneBadge } from "@/components/biz/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/date";

import type { DiagnosisDto } from "@otd/contracts/metrics";

type DiagnosisPanelProps = {
  diagnosis: DiagnosisDto | undefined;
  loading: boolean;
  refreshing: boolean;
  tabLabel: string;
  onRefresh: () => void;
};

export function DiagnosisPanel({ diagnosis, loading, refreshing, tabLabel, onRefresh }: DiagnosisPanelProps) {
  const { t } = useTranslation("metrics");
  return (
    <section aria-label={t("DIAG_TITLE")} className="rounded-[var(--radius)] border border-border bg-card shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="font-medium">{t("DIAG_TITLE")}</h2>
          <p className="text-xs text-muted-foreground">{t("DIAG_SUB")}</p>
        </div>
        <Button disabled={refreshing} size="sm" variant="outline" onClick={onRefresh}>
          <RefreshCw aria-hidden="true" className={refreshing ? "size-4 animate-spin" : "size-4"} />
          {refreshing ? t("DIAG_REFRESHING") : t("DIAG_REFRESH")}
        </Button>
      </header>
      {loading && !diagnosis ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("LOADING")}</p>
      ) : !diagnosis ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("DIAG_EMPTY")}</p>
      ) : (
        <div className="grid gap-4 p-4 lg:grid-cols-[260px_1fr]">
          <div className="space-y-2 rounded-[var(--radius)] bg-primary-soft/60 p-4">
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Sparkles aria-hidden="true" className="size-4" />
            </span>
            <p className="text-xs text-muted-foreground">{`${t("DIAG_SUMMARY")} · ${tabLabel}`}</p>
            <h3 className="text-base font-semibold">{diagnosis.title}</h3>
            <p className="text-xs text-muted-foreground">{diagnosis.scopeLabel}</p>
            <p className="text-xs text-muted-foreground">{t("DIAG_CUTOFF", { date: diagnosis.asOf })}</p>
            <p className="text-sm">{diagnosis.summary}</p>
            <p className="text-xs text-muted-foreground">
              {[diagnosis.model ? t("DIAG_MODEL_AI", { model: diagnosis.model }) : t("DIAG_MODEL_RULES"), t("DIAG_GENERATED", { time: formatDate(diagnosis.generatedAt, true) }), diagnosis.cached ? t("DIAG_CACHED") : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <b className="text-sm">{t("DIAG_FINDINGS")}</b>
              <span className="text-xs text-muted-foreground">{t("DIAG_COUNT", { count: diagnosis.items.length })}</span>
            </div>
            <ol className="space-y-2" data-testid="diagnosis-items">
              {diagnosis.items.map((item) => (
                <li className="rounded-md border border-border p-3" key={item.no}>
                  <div className="flex flex-wrap items-start gap-2">
                    <span className="tabular text-xs font-semibold text-muted-foreground">{String(item.no).padStart(2, "0")}</span>
                    <ToneBadge label={item.level === "PRIORITY" ? t("LEVEL_PRIORITY") : t("LEVEL_WATCH")} tone={item.level === "PRIORITY" ? "danger" : "warning"} />
                    <span className="min-w-0 flex-1 text-sm font-medium">{item.title}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">{`${t("DIAG_BASIS")}：${item.basis}`}</p>
                  <p className="mt-0.5 text-xs">{`${t("DIAG_SUGGESTION")}：${item.suggestion}`}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}
