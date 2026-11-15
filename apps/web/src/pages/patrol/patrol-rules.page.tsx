import { SEVERITIES, pickLabel, type Severity } from "@otd/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useHasPermission } from "@/app/providers/auth-provider";
import { ToneBadge } from "@/components/biz/status-badge";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useUpdatePatrolRuleMutation } from "@/features/patrol/patrol.mutations";
import { usePatrolRulesQuery } from "@/features/patrol/patrol.queries";
import { BizError } from "@/lib/http/errors";

import type { PatrolRuleDto, PatrolRuleUpdateInput } from "@otd/contracts/patrol";

type Draft = { thresholdDays: number; yellowWindowDays: number; severity: Severity; enabled: boolean };
const SEVERITY_CODES: Severity[] = ["HIGH", "MEDIUM", "LOW"];

function draftOf(rule: PatrolRuleDto): Draft {
  return { thresholdDays: rule.params.thresholdDays ?? 0, yellowWindowDays: rule.yellowWindowDays, severity: rule.severity, enabled: rule.enabled };
}

function changes(rule: PatrolRuleDto, draft: Draft): Omit<PatrolRuleUpdateInput, "version"> {
  const base = draftOf(rule);
  return {
    ...(draft.thresholdDays !== base.thresholdDays ? { params: { thresholdDays: draft.thresholdDays } } : {}),
    ...(draft.yellowWindowDays !== base.yellowWindowDays ? { yellowWindowDays: draft.yellowWindowDays } : {}),
    ...(draft.severity !== base.severity ? { severity: draft.severity } : {}),
    ...(draft.enabled !== base.enabled ? { enabled: draft.enabled } : {}),
  };
}

export function PatrolRulesPage() {
  const { t, i18n } = useTranslation("patrol");
  const lang = i18n.language;
  const rules = usePatrolRulesQuery();
  const update = useUpdatePatrolRuleMutation();
  const canEdit = useHasPermission("patrol.rule.edit");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const draftFor = (rule: PatrolRuleDto) => drafts[rule.id] ?? draftOf(rule);
  const patch = (rule: PatrolRuleDto, value: Partial<Draft>) => setDrafts((prev) => ({ ...prev, [rule.id]: { ...draftFor(rule), ...value } }));
  const reset = (rule: PatrolRuleDto) =>
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[rule.id];
      return next;
    });

  async function save(rule: PatrolRuleDto) {
    const diff = changes(rule, draftFor(rule));
    try {
      await update.mutateAsync({ id: rule.id, input: { ...diff, version: rule.version } });
      reset(rule);
      toast.success(t("SAVED"));
    } catch (err) {
      if (err instanceof BizError && err.code === "COMMON_VERSION_CONFLICT") {
        reset(rule);
        toast.error(t("VERSION_CONFLICT"));
      } else toast.error(err instanceof Error ? err.message : t("FAILED"));
    }
  }

  const kindLabel = (kind: PatrolRuleDto["kind"]) => (kind === "DWELL" ? t("KIND_DWELL") : kind === "DEADLINE" ? t("KIND_DEADLINE") : kind === "MISSING" ? t("KIND_MISSING") : "—");

  return (
    <section className="space-y-5">
      <PageHeader description={t("RULE_NOTE")} title={t("RULES_TITLE")} />
      {rules.isLoading ? (
        <LoadingState />
      ) : rules.error ? (
        <ErrorState error={rules.error} />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius)] border border-border bg-card shadow-xs">
          <table className="w-full min-w-[1200px] text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th className="h-11 px-3 font-medium">{t("RULE_CODE")}</th>
                <th className="px-3 font-medium">{t("COL_MODULE")}</th>
                <th className="px-3 font-medium">{t("RULE_NAME")}</th>
                <th className="px-3 font-medium">{t("RULE_TARGET")}</th>
                <th className="px-3 font-medium">{t("RULE_CONDITION")}</th>
                <th className="px-3 font-medium">{t("RULE_THRESHOLD")}</th>
                <th className="px-3 font-medium">{t("RULE_WINDOW")}</th>
                <th className="px-3 font-medium">{t("COL_SEVERITY")}</th>
                <th className="px-3 font-medium">{t("RULE_ASSIGNEE")}</th>
                <th className="px-3 font-medium">{t("RULE_CUSTOMERS")}</th>
                <th className="px-3 font-medium">{t("RULE_ENABLED")}</th>
                <th className="px-3 font-medium">{t("RULE_OPEN_HITS")}</th>
                <th className="px-3 font-medium">{t("COL_ACTION")}</th>
              </tr>
            </thead>
            <tbody>
              {(rules.data ?? []).map((rule) => {
                const draft = draftFor(rule);
                const dirty = Object.keys(changes(rule, draft)).length > 0;
                const name = lang.startsWith("en") ? (rule.nameEn ?? rule.name) : rule.name;
                return (
                  <tr className="border-t border-border" data-testid={`rule-${rule.code}`} key={rule.id}>
                    <td className="tabular px-3 py-2 font-semibold">{rule.code}</td>
                    <td className="px-3 whitespace-nowrap">{pickLabel(rule.moduleLabel, lang)}</td>
                    <td className="px-3">
                      <div>{name}</div>
                      <div className="text-xs text-muted-foreground">{kindLabel(rule.kind)}</div>
                    </td>
                    <td className="px-3 whitespace-nowrap">{t(`TARGET_${rule.targetType}`, { defaultValue: rule.targetType })}</td>
                    <td className="max-w-56 px-3 text-xs text-muted-foreground">{pickLabel(rule.condition, lang)}</td>
                    <td className="px-3">
                      <Input
                        aria-label={`${rule.code} ${t("RULE_THRESHOLD")}`}
                        className="h-8 w-20"
                        disabled={!canEdit}
                        min={0}
                        type="number"
                        value={draft.thresholdDays}
                        onChange={(e) => patch(rule, { thresholdDays: Math.max(0, Number(e.target.value) || 0) })}
                      />
                    </td>
                    <td className="px-3">
                      <Input
                        aria-label={`${rule.code} ${t("RULE_WINDOW")}`}
                        className="h-8 w-20"
                        disabled={!canEdit}
                        min={0}
                        type="number"
                        value={draft.yellowWindowDays}
                        onChange={(e) => patch(rule, { yellowWindowDays: Math.max(0, Number(e.target.value) || 0) })}
                      />
                    </td>
                    <td className="px-3">
                      {canEdit ? (
                        <select
                          aria-label={`${rule.code} ${t("COL_SEVERITY")}`}
                          className="h-8 rounded-md border border-input bg-card px-2 text-sm"
                          value={draft.severity}
                          onChange={(e) => patch(rule, { severity: e.target.value as Severity })}
                        >
                          {SEVERITY_CODES.map((s) => (
                            <option key={s} value={s}>
                              {pickLabel(SEVERITIES[s].label, lang)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <ToneBadge label={pickLabel(SEVERITIES[rule.severity].label, lang)} tone={SEVERITIES[rule.severity].tone} />
                      )}
                    </td>
                    <td className="px-3 whitespace-nowrap">{rule.assigneeRoleLabel ? pickLabel(rule.assigneeRoleLabel, lang) : rule.assigneeRole}</td>
                    <td className="max-w-40 px-3 text-xs">{rule.customerNames.length ? rule.customerNames.join("、") : t("RULE_ALL_CUSTOMERS")}</td>
                    <td className="px-3">
                      <Switch aria-label={`${rule.code} ${t("RULE_ENABLED")}`} checked={draft.enabled} disabled={!canEdit} onCheckedChange={(checked) => patch(rule, { enabled: checked })} />
                    </td>
                    <td className="tabular px-3">{rule.openHits}</td>
                    <td className="px-3 whitespace-nowrap">
                      {canEdit && dirty ? (
                        <div className="flex gap-1">
                          <Button disabled={update.isPending} size="sm" onClick={() => void save(rule)}>
                            {t("RULE_SAVE")}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => reset(rule)}>
                            {t("RULE_RESET")}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
