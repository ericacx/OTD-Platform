import { CircleCheck, CircleMinus, CircleX } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import type { HandoverCheckDto } from "../document.types";

export function HandoverChecklist({ items }: { items: HandoverCheckDto[] }) {
  const { t, i18n } = useTranslation("document");
  const en = i18n.language.startsWith("en");
  return (
    <ol aria-label={t("CHECKLIST")} className="divide-y divide-border rounded-md border border-border">
      {items.map((item, index) => {
        const state = !item.applicable ? "na" : item.ok ? "ok" : "missing";
        const Icon = state === "ok" ? CircleCheck : state === "na" ? CircleMinus : CircleX;
        return (
          <li className="flex items-start gap-3 px-4 py-3" data-state={state} key={item.key}>
            <span className="tabular mt-0.5 w-5 text-sm text-muted-foreground">{index + 1}</span>
            <Icon
              aria-hidden="true"
              className={cn(
                "mt-0.5 size-5 shrink-0",
                state === "ok" ? "text-success" : state === "na" ? "text-muted-foreground" : "text-danger",
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{en ? item.label.en : item.label.zh}</p>
              <p className="text-xs text-muted-foreground">
                {state === "na"
                  ? t("NOT_APPLICABLE")
                  : state === "ok"
                    ? (item.note ?? "")
                    : (item.note ?? t("MISSING"))}
              </p>
            </div>
            <span
              className={cn(
                "text-sm",
                state === "ok"
                  ? "tabular font-medium"
                  : state === "na"
                    ? "text-muted-foreground"
                    : "font-medium text-danger",
              )}
            >
              {state === "ok" ? (item.ref ?? t("OK")) : state === "na" ? t("NA_SHORT") : t("MISSING")}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
