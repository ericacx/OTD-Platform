import { useTranslation } from "react-i18next";

import { ToneBadge } from "@/components/biz/status-badge";

export function SourceTag({ source }: { source: string | undefined }) {
  const { t } = useTranslation("capacity");
  if (!source) return null;
  return source === "SYNC" ? (
    <ToneBadge className="h-5 px-1.5" label={t("SRC_SYNC")} tone="info" />
  ) : source === "MANUAL" ? (
    <ToneBadge className="h-5 px-1.5" label={t("SRC_MANUAL")} tone="warning" />
  ) : (
    <ToneBadge className="h-5 px-1.5" label={t("SRC_DEFAULT")} />
  );
}
