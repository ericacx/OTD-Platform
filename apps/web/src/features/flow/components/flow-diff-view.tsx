import { useTranslation } from "react-i18next";

import { ToneBadge } from "@/components/biz/status-badge";

import { gateConditionLabel, nodeLabel } from "./flow-labels";

import type { FlowDiffDto } from "../flow.types";
import type { ReactNode } from "react";

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(" / ");
  return JSON.stringify(value);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-semibold text-muted-foreground">{title}</h3>
      <div className="flex flex-wrap gap-1.5 text-sm">{children}</div>
    </div>
  );
}

function Chip({ tone, children }: { tone: "add" | "remove" | "change"; children: ReactNode }) {
  const text = (Array.isArray(children) ? children : [children])
    .map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : ""))
    .join("");
  return (
    <ToneBadge
      className={tone === "remove" ? "line-through" : undefined}
      label={text}
      tone={tone === "add" ? "success" : tone === "remove" ? "danger" : "warning"}
    />
  );
}

export function FlowDiffView({ diff }: { diff: FlowDiffDto }) {
  const { t, i18n } = useTranslation("flow");
  const lang = i18n.language;
  if (diff.identical) return <p className="text-sm text-muted-foreground">{t("DIFF_IDENTICAL")}</p>;
  return (
    <div className="space-y-4" data-testid="flow-diff">
      <p className="text-xs text-muted-foreground">
        {t("DIFF_RANGE", {
          from: diff.from.versionNo ? `v${diff.from.versionNo}` : t("DIFF_UNCONFIGURED"),
          to: diff.to.versionNo ? `v${diff.to.versionNo}` : t("DIFF_DRAFT"),
        })}
      </p>
      {diff.modulesAdded.length || diff.modulesRemoved.length ? (
        <Section title={t("DIFF_MODULES")}>
          {diff.modulesAdded.map((m) => (
            <Chip key={`a-${m.moduleCode}`} tone="add">
              + {m.name}
            </Chip>
          ))}
          {diff.modulesRemoved.map((m) => (
            <Chip key={`r-${m.moduleCode}`} tone="remove">
              {m.name}
            </Chip>
          ))}
        </Section>
      ) : null}
      {diff.orderChanged ? (
        <Section title={t("DIFF_ORDER")}>
          <Chip tone="change">{t("DIFF_ORDER_CHANGED")}</Chip>
        </Section>
      ) : null}
      {diff.departmentsChanged.length ? (
        <Section title={t("DIFF_DEPARTMENTS")}>
          {diff.departmentsChanged.map((d) => (
            <Chip key={d.moduleCode} tone="change">
              {d.name}：{d.from} → {d.to}
            </Chip>
          ))}
        </Section>
      ) : null}
      {diff.itemsAdded.length || diff.itemsRemoved.length || diff.itemParamsChanged.length ? (
        <Section title={t("DIFF_ITEMS")}>
          {diff.itemsAdded.map((i) => (
            <Chip key={`a-${i.itemCode}`} tone="add">
              + {i.name}
            </Chip>
          ))}
          {diff.itemsRemoved.map((i) => (
            <Chip key={`r-${i.itemCode}`} tone="remove">
              {i.name}
            </Chip>
          ))}
          {diff.itemParamsChanged.map((i) => (
            <Chip key={`c-${i.itemCode}`} tone="change">
              {i.name}
            </Chip>
          ))}
        </Section>
      ) : null}
      {diff.paramsChanged.length ? (
        <Section title={t("DIFF_PARAMS")}>
          {diff.paramsChanged.map((p) => (
            <Chip key={p.key} tone="change">
              {t(`PARAM_${p.key}` as "PARAM_aqlLevel", { defaultValue: p.key })}：{formatValue(p.from)} →{" "}
              {formatValue(p.to)}
            </Chip>
          ))}
        </Section>
      ) : null}
      {diff.nodesAdded.length || diff.nodesRemoved.length ? (
        <Section title={t("DIFF_NODES")}>
          {diff.nodesAdded.map((n) => (
            <Chip key={`a-${n}`} tone="add">
              + {n} {nodeLabel(n, lang)}
            </Chip>
          ))}
          {diff.nodesRemoved.map((n) => (
            <Chip key={`r-${n}`} tone="remove">
              {n} {nodeLabel(n, lang)}
            </Chip>
          ))}
        </Section>
      ) : null}
      {diff.gateConditionsAdded.length || diff.gateConditionsRemoved.length ? (
        <Section title={t("DIFF_GATES")}>
          {diff.gateConditionsAdded.map((g) => (
            <Chip key={`a-${g.gate}${g.key}`} tone="add">
              + {g.gate} {gateConditionLabel(g.gate, g.key, lang)}
            </Chip>
          ))}
          {diff.gateConditionsRemoved.map((g) => (
            <Chip key={`r-${g.gate}${g.key}`} tone="remove">
              {g.gate} {gateConditionLabel(g.gate, g.key, lang)}
            </Chip>
          ))}
        </Section>
      ) : null}
    </div>
  );
}
