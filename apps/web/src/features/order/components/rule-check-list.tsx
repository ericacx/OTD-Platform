import { pickLabel } from "@otd/shared";
import { CheckCircle2, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import type { RuleCheckItemDto } from "../order.types";

type RuleCheckListProps = { items: RuleCheckItemDto[] | null | undefined; className?: string };

export function RuleCheckList({ items, className }: RuleCheckListProps) {
  const { t, i18n } = useTranslation("order");
  if (!items?.length) return <p className="text-sm text-muted-foreground">{t("RULE_EMPTY")}</p>;
  return (
    <ul className={cn("space-y-2.5", className)}>
      {items.map((item) => (
        <li className="flex items-start gap-2.5 text-sm" data-passed={item.passed} key={item.key}>
          {item.passed ? (
            <CheckCircle2 aria-label={t("RULE_PASS")} className="mt-0.5 size-4 shrink-0 text-success" role="img" />
          ) : (
            <XCircle aria-label={t("RULE_FAIL")} className="mt-0.5 size-4 shrink-0 text-danger" role="img" />
          )}
          <div className="min-w-0">
            <p className={cn("font-medium", !item.passed && "text-danger")}>{pickLabel(item.label, i18n.language)}</p>
            {item.detail ? <p className="text-xs text-muted-foreground">{item.detail}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ruleSummary(items: RuleCheckItemDto[] | null | undefined): { failed: number; passed: boolean } {
  const failed = (items ?? []).filter((i) => !i.passed).length;
  return { failed, passed: Boolean(items?.length) && failed === 0 };
}
