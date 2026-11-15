import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { useItemLabels } from "../labels";

import type { ReuseMatchDto } from "../testing.types";

export function ReuseChecks({ match }: { match: ReuseMatchDto }) {
  const { t } = useTranslation("testing");
  const items = useItemLabels();
  const keyMatch = match.sameStructure && match.sameCraft && match.sameYarn;
  const rows: [string, string, boolean][] = [
    [t("REUSE_SAME_CUSTOMER"), match.report.customerName, match.sameCustomer],
    [
      t("REUSE_SAME_STYLE"),
      match.sameStyle
        ? `#${match.report.styleNo}`
        : [match.report.reuseKey.structure, match.report.reuseKey.craft, match.report.reuseKey.yarn]
            .filter(Boolean)
            .join(" · ") || "—",
      match.sameStyle || keyMatch,
    ],
    [
      t("REUSE_ITEMS"),
      match.missingItems.length ? t("REUSE_MISSING", { items: items(match.missingItems) }) : items(match.coveredItems),
      match.missingItems.length === 0,
    ],
    [t("REUSE_VALID"), t("REUSE_VALID_UNTIL", { date: match.report.validUntil }), match.inValidity],
    [t("REUSE_PASSED"), match.report.result === "PASS" ? t("RESULT_PASS") : t("RESULT_FAIL"), match.passed],
  ];
  return (
    <ul className="space-y-1.5 text-sm">
      {rows.map(([label, detail, ok]) => (
        <li className="flex items-center gap-2" data-ok={ok} key={label}>
          <span
            className={cn(
              "inline-flex size-5 shrink-0 items-center justify-center rounded-full",
              ok ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
            )}
          >
            {ok ? <Check aria-hidden="true" className="size-3" /> : <X aria-hidden="true" className="size-3" />}
          </span>
          <span>{label}</span>
          <span className="ml-auto truncate text-xs text-muted-foreground">{detail}</span>
        </li>
      ))}
    </ul>
  );
}
