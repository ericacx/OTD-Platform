import { useTranslation } from "react-i18next";

import { ToneBadge } from "@/components/biz/status-badge";
import { formatDate } from "@/lib/date";

import type { PurchaseDto } from "../purchase.types";

export function PromisedDate({
  purchase,
}: {
  purchase: Pick<PurchaseDto, "promisedDate" | "overdue" | "overdueDays">;
}) {
  const { t } = useTranslation("purchase");
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="tabular">{formatDate(purchase.promisedDate)}</span>
      {purchase.overdue ? <ToneBadge label={t("OVERDUE_DAYS", { days: purchase.overdueDays })} tone="danger" /> : null}
    </span>
  );
}
