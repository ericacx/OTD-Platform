import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { NODE_CODES, gateConditionLabel, nodeLabel } from "./flow-labels";

type NodeStripProps = { runtime: { nodes: string[]; gateConditions: { G1: string[]; G2: string[] } } };

export function NodeStrip({ runtime }: NodeStripProps) {
  const { t, i18n } = useTranslation("flow");
  const lang = i18n.language;
  return (
    <section className="rounded-[var(--radius)] border border-border bg-card p-4 shadow-xs">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("NODES_TITLE")}</h2>
        <p className="text-xs text-muted-foreground">{t("NODES_HINT")}</p>
      </div>
      <ol aria-label={t("NODES_TITLE")} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {NODE_CODES.map((code) => {
          const on = runtime.nodes.includes(code);
          return (
            <li
              className={cn(
                "rounded-md border px-3 py-2 text-xs",
                on
                  ? "border-primary/30 bg-primary-soft text-primary"
                  : "border-dashed border-border text-muted-foreground",
              )}
              data-applicable={on}
              key={code}
            >
              <span className="tabular block font-semibold">{code}</span>
              <span className="block truncate">{nodeLabel(code, lang)}</span>
              {on ? null : <span className="block">{t("NOT_APPLICABLE")}</span>}
            </li>
          );
        })}
      </ol>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        {(["G1", "G2"] as const).map((gate) => (
          <div key={gate}>
            <dt className="font-medium text-foreground">{t(gate === "G1" ? "GATE_G1" : "GATE_G2")}</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5 text-muted-foreground">
              {runtime.gateConditions[gate].length
                ? runtime.gateConditions[gate].map((key) => (
                    <span className="rounded bg-muted px-1.5 py-0.5" key={key}>
                      {gateConditionLabel(gate, key, lang)}
                    </span>
                  ))
                : t("GATE_EMPTY")}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
