import { NODE_STATES, pickLabel } from "@otd/shared";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ProgressTimeline, type TimelineState, type TimelineStep } from "@/components/biz/progress-timeline";
import { ToneBadge } from "@/components/biz/status-badge";
import { formatDate } from "@/lib/date";

import type { MainlineDto, NodeStateDto } from "../mainline.types";

const STATE: Record<NodeStateDto, TimelineState> = {
  NOT_STARTED: "pending",
  IN_PROGRESS: "current",
  DONE: "done",
  BLOCKED: "blocked",
  NOT_APPLICABLE: "na",
};

export function MainlineHeadline({ mainline }: { mainline: MainlineDto }) {
  const { i18n } = useTranslation();
  return (
    <p className="text-sm text-muted-foreground" data-testid="mainline-headline">
      <span className="font-semibold text-foreground">{pickLabel(mainline.headline, i18n.language)}</span>
    </p>
  );
}

export function MainlineTimeline({ mainline }: { mainline: MainlineDto }) {
  const { t, i18n } = useTranslation("order");
  const lang = i18n.language;
  const steps = mainline.nodes.map((node): TimelineStep => {
    const step: TimelineStep = {
      key: node.code,
      title: pickLabel(node.name, lang),
      state: STATE[node.state],
      gate: node.gate !== null,
      description: pickLabel(node.summary, lang),
    };
    if (node.link && node.state !== "NOT_APPLICABLE") step.link = { to: node.link };
    const showStyles = node.styles.length > 1;
    if (node.blockedReasons.length || showStyles || node.parallel) {
      step.children = (
        <div className="space-y-2">
          {node.parallel ? <ToneBadge label={t("ML_PARALLEL")} tone="info" /> : null}
          {node.blockedReasons.length ? (
            <ul className="space-y-1">
              {node.blockedReasons.map((reason, index) => (
                <li className="flex items-start gap-1.5 text-sm text-danger" key={`${node.code}-${index}`}>
                  <AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                  <span>{pickLabel(reason, lang)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {showStyles ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>{t("ML_STYLES")}</span>
              {node.styles.map((s) => (
                <ToneBadge
                  key={s.styleNo}
                  label={`#${s.styleNo} ${pickLabel(NODE_STATES[s.state].label, lang)}`}
                  tone={NODE_STATES[s.state].tone}
                />
              ))}
            </div>
          ) : null}
        </div>
      );
    }
    const meta = [
      node.enteredAt && node.state !== "NOT_APPLICABLE" ? t("ML_ENTERED", { date: formatDate(node.enteredAt) }) : null,
      node.completedAt ? t("ML_COMPLETED", { date: formatDate(node.completedAt) }) : null,
    ].filter(Boolean);
    if (meta.length) step.meta = meta.join(" · ");
    return step;
  });
  return <ProgressTimeline steps={steps} />;
}
