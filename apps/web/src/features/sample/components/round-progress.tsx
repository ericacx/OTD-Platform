import { useTranslation } from "react-i18next";

import { ProgressTimeline, type TimelineState } from "@/components/biz/progress-timeline";
import { formatDate } from "@/lib/date";

import type { RoundDto, StageView } from "../sample.types";

const STATE: Record<StageView["state"], TimelineState> = { DONE: "done", ACTIVE: "current", PENDING: "pending" };

export function RoundProgress({ round }: { round: RoundDto }) {
  const { t } = useTranslation("sample");
  return (
    <ProgressTimeline
      steps={round.stages.map((s, i) => {
        const parts =
          s.state === "DONE"
            ? [
                s.completedAt ? t("STAGE_DONE_AT", { time: formatDate(s.completedAt, true) }) : null,
                s.location,
                s.operatorName,
              ]
            : s.state === "ACTIVE"
              ? [s.enteredAt ? t("STAGE_STARTED_AT", { time: formatDate(s.enteredAt, true) }) : null, s.location]
              : [];
        const description = parts.filter(Boolean).join(" ｜ ");
        return {
          key: s.stage,
          title: t("STAGE_TITLE", { no: String(i + 1).padStart(2, "0"), name: t(`STAGE_${s.stage}`) }),
          state: STATE[s.state],
          ...(description ? { description } : {}),
          ...(s.passes > 1 ? { meta: t("STAGE_PASSES", { count: s.passes }) } : {}),
          duration: { spentHours: s.durationHours, avgHours: s.avgHours },
        };
      })}
    />
  );
}
