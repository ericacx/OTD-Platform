import { useTranslation } from "react-i18next";

import { Money } from "@/components/biz/money";
import { ToneBadge } from "@/components/biz/status-badge";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { ReceivableDto } from "@otd/contracts/receivable";

export function PaidProgress({ ar }: { ar: ReceivableDto }) {
  const { i18n } = useTranslation();
  const pct = Math.round(ar.progress * 100);
  const digits = ar.currency === "JPY" ? 0 : 2;
  return (
    <div className="min-w-36 space-y-1">
      <div className="tabular text-xs">
        {formatNumber(ar.receivedAmount, digits, i18n.language)} / {formatNumber(ar.amount, digits, i18n.language)}
      </div>
      <div aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[11px] text-muted-foreground">
        {ar.currency} · {pct}%
      </div>
    </div>
  );
}

export function OverdueCell({ ar }: { ar: ReceivableDto }) {
  const { t } = useTranslation("receivable");
  return (
    <div className="flex flex-col items-start gap-1">
      {ar.overdue ? (
        <span className={cn("tabular font-semibold", ar.overdueDays > 7 ? "text-danger" : "text-warning")}>
          {t("DAYS_N", { n: ar.overdueDays })}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
      {ar.disputed ? <ToneBadge label={t("DISPUTED")} tone="danger" /> : null}
    </div>
  );
}

export function AmountCell({ ar }: { ar: ReceivableDto }) {
  return <Money amount={ar.amount} className="font-semibold" currency={ar.currency} negativeDanger />;
}
