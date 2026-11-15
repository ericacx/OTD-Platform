import { useState } from "react";
import { useTranslation } from "react-i18next";

import { RequirePermission } from "@/app/router/guards";
import { ToneBadge } from "@/components/biz/status-badge";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { StrategyFormDialog } from "@/features/quote/components/strategy-form-dialog";
import { pct, tierText } from "@/features/quote/quote.format";
import { useStrategiesQuery } from "@/features/quote/quote.queries";
import { formatDate } from "@/lib/date";

import type { QuoteStrategyDto } from "@/features/quote/quote.types";

const TH = "h-11 px-4 text-left font-medium whitespace-nowrap";
const TD = "px-4 py-3 whitespace-nowrap";

export function StrategiesPage() {
  const { t } = useTranslation("quote");
  const { t: tc } = useTranslation();
  const strategies = useStrategiesQuery();
  const [editing, setEditing] = useState<QuoteStrategyDto | null | undefined>(undefined);
  const list = strategies.data ?? [];

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <RequirePermission code="quote.strategy.edit">
            <Button onClick={() => setEditing(null)}>{t("STRATEGY_NEW")}</Button>
          </RequirePermission>
        }
        description={t("STRATEGY_NOTE")}
        title={t("STRATEGIES_TITLE")}
      />
      {strategies.isLoading ? (
        <LoadingState />
      ) : strategies.error ? (
        <ErrorState error={strategies.error} />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className={TH}>{t("CODE")}</th>
                  <th className={TH}>{t("STRATEGY_NAME")}</th>
                  <th className={TH}>{t("METHOD")}</th>
                  <th className={TH}>{t("FIELD_lossRate")}</th>
                  <th className={TH}>{t("FIELD_overheadRate")}</th>
                  <th className={TH}>{t("FIELD_markupRate")}</th>
                  <th className={TH}>{t("FIELD_targetMargin")}</th>
                  <th className={TH}>{t("FIELD_guardrail")}</th>
                  <th className={TH}>{t("LOCKED_FX")}</th>
                  <th className={TH}>{t("MOQ_UPLIFT")}</th>
                  <th className={TH}>{t("SKU_TIERS")}</th>
                  <th className={TH}>{t("USED_BY")}</th>
                  <th className={TH}>{t("VERSION")}</th>
                  <th className={TH}>{t("STATUS")}</th>
                  <th className={TH}>{tc("TBL_ACTIONS")}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr className="border-t border-border hover:bg-muted/50" key={s.id}>
                    <td className={`${TD} tabular font-semibold`}>{s.code}</td>
                    <td className={TD}>{s.name}</td>
                    <td className={TD}>{s.method === "MARKUP" ? t("METHOD_MARKUP") : t("METHOD_MARGIN")}</td>
                    <td className={`${TD} tabular`}>{pct(s.lossRate, 0)}</td>
                    <td className={`${TD} tabular`}>{pct(s.overheadRate, 0)}</td>
                    <td className={`${TD} tabular`}>{pct(s.markupRate, 0)}</td>
                    <td className={`${TD} tabular`}>{pct(s.targetMargin, 0)}</td>
                    <td className={`${TD} tabular`}>{pct(s.guardrail, 0)}</td>
                    <td className={`${TD} tabular`}>{s.lockedFx}</td>
                    <td className={`${TD} tabular`}>
                      {s.moq.toLocaleString()} / +{pct(s.smallOrderUplift, 0)}
                    </td>
                    <td className="max-w-80 px-4 py-3 text-muted-foreground">
                      {s.skuTiers.length ? tierText(s.skuTiers, t("UNIT_WAN")) : t("NONE")}
                    </td>
                    <td className={`${TD} tabular text-right`}>{s.usedBy}</td>
                    <td className={`${TD} tabular text-muted-foreground`}>
                      v{s.version} · {formatDate(s.updatedAt)}
                    </td>
                    <td className={TD}>
                      <ToneBadge
                        label={s.enabled ? tc("6B0AKM") : tc("STINACT")}
                        tone={s.enabled ? "success" : "neutral"}
                      />
                    </td>
                    <td className={TD}>
                      <RequirePermission code="quote.strategy.edit">
                        <Button className="h-auto px-0" variant="link" onClick={() => setEditing(s)}>
                          {tc("1VV96U")}
                        </Button>
                      </RequirePermission>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
            {tc("PGTOTAL", { count: list.length })}
          </p>
        </div>
      )}
      <StrategyFormDialog
        open={editing !== undefined}
        strategy={editing ?? null}
        onOpenChange={(open) => !open && setEditing(undefined)}
      />
    </section>
  );
}
