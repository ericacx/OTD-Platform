import { pickLabel } from "@otd/shared";
import { Check, Diamond, Minus, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { SectionCard } from "@/components/biz/detail-header-card";
import { FieldGrid } from "@/components/biz/field-grid";
import { ToneBadge } from "@/components/biz/status-badge";
import { cn } from "@/lib/utils";

import type { InspectionDto, ReleaseCheckDto } from "@otd/contracts/inspection";

export function GateChecklist({ check, isFinal = true }: { check: ReleaseCheckDto; isFinal?: boolean }) {
  const { t, i18n } = useTranslation("inspection");
  const applicable = check.items.filter((i) => i.applicable);
  const met = applicable.filter((i) => i.passed).length;
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3" data-testid="gate-checklist">
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <Diamond aria-hidden="true" className="size-3.5 fill-primary text-primary" />
        <span>{t("GATE_MET", { met, total: applicable.length })}</span>
        {!isFinal ? (
          <ToneBadge label={t("GATE_NO_VERDICT")} tone="neutral" />
        ) : check.passed ? (
          <ToneBadge label={t("GATE_PASS")} tone="success" />
        ) : (
          <ToneBadge label={t("GATE_BLOCKED")} tone="danger" />
        )}
      </div>
      <ul className="space-y-1.5">
        {check.items.map((item, index) => {
          const state = !item.applicable ? "na" : item.passed ? "yes" : "no";
          return (
            <li className="flex items-start gap-2 text-sm" data-state={state} key={item.key}>
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full",
                  state === "yes" && "bg-success/12 text-success",
                  state === "no" && "bg-danger/12 text-danger",
                  state === "na" && "bg-muted text-subtle-foreground",
                )}
              >
                {state === "yes" ? (
                  <Check className="size-3.5" />
                ) : state === "no" ? (
                  <X className="size-3.5" />
                ) : (
                  <Minus className="size-3.5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn("font-medium", state === "na" && "text-muted-foreground")}>
                    {`${["①", "②", "③"][index] ?? ""} ${pickLabel(item.label, i18n.language)}`}
                  </span>
                  <span className="sr-only">
                    {t(state === "yes" ? "CHECK_YES" : state === "no" ? "CHECK_NO" : "CHECK_NA")}
                  </span>
                  {state === "na" ? <ToneBadge label={t("CHECK_NA")} tone="neutral" /> : null}
                </div>
                {item.detail && state !== "na" ? <p className="text-xs text-muted-foreground">{item.detail}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type ReleaseGateCardProps = { inspection: InspectionDto; check: ReleaseCheckDto | undefined };

export function ReleaseGateCard({ inspection, check }: ReleaseGateCardProps) {
  const { t } = useTranslation("inspection");
  const isFinal = inspection.stage === "FRI";
  return (
    <SectionCard title={t("GATE_CARD")}>
      <div className="space-y-4">
        {check ? <GateChecklist check={check} isFinal={isFinal} /> : null}
        <FieldGrid
          columns={2}
          items={[
            { label: t("ROLE_SCHEDULE"), value: t("ROLE_SCHEDULE_VALUE") },
            { label: t("ROLE_REQUEST"), value: t("ROLE_REQUEST_VALUE") },
            { label: t("ROLE_CONCLUDE"), value: inspection.method ?? t("ROLE_CONCLUDE_VALUE") },
            { label: t("GRANULARITY"), value: inspection.granularity },
            { label: t("DAILY_LIMIT"), value: check ? t("DAILY_LIMIT_VALUE", { count: check.dailyLimit }) : null },
            { label: t("REF_DATE"), value: check?.refDate },
            { label: t("GATE_NOTE"), value: isFinal ? t("GATE_NOTE_FINAL") : t("GATE_NOTE_MID"), span: "full" },
            {
              label: t("RELEASE_RULE"),
              value: check ? t("RELEASE_RULE_VALUE", { days: check.releaseDays }) : null,
              span: "full",
            },
          ]}
        />
      </div>
    </SectionCard>
  );
}
