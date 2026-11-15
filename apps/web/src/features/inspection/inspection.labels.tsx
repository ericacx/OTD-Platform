import { INSPECTION_STAGE_LABELS, type InspectionStage } from "@otd/contracts/inspection";
import { pickLabel } from "@otd/shared";
import { useTranslation } from "react-i18next";

import { ToneBadge } from "@/components/biz/status-badge";

export function stageLabel(stage: InspectionStage, locale: string): string {
  return pickLabel(INSPECTION_STAGE_LABELS[stage], locale);
}

export function ConclusionBadge({ result }: { result: "PASS" | "FAIL" | null | undefined }) {
  const { t } = useTranslation("inspection");
  if (!result) return <span className="text-muted-foreground">—</span>;
  return result === "PASS" ? (
    <ToneBadge label={t("PASS")} tone="success" />
  ) : (
    <ToneBadge label={t("FAIL")} tone="danger" />
  );
}
