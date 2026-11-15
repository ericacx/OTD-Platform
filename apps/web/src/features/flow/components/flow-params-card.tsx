import { DEFAULT_FLOW_PARAMS, INSPECTION_STAGE_CODES } from "@otd/contracts/flow";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import type { FlowParams } from "../flow.types";

type FlowParamsCardProps = {
  params: Record<string, unknown>;
  canEdit: boolean;
  busy: boolean;
  onSave: (params: FlowParams) => void;
};

const NUMBER_FIELDS = [
  "paymentTermsDays",
  "reportValidityMonths",
  "releaseDaysBeforeExFactory",
  "sameFactorySameDayLimit",
  "sampleRoundStuckDays",
  "approvalWaitDays",
  "reconciliationDay",
] as const;
const REUSE_KEYS = ["sameStructure", "sameProcess", "coverItems", "withinValidity", "allowCrossStyle"] as const;
const START_FROM = ["SHIP_DATE", "INVOICE_DATE", "ARRIVAL_DATE"] as const;

export function FlowParamsCard({ params, canEdit, busy, onSave }: FlowParamsCardProps) {
  const { t } = useTranslation("flow");
  const [value, setValue] = useState<FlowParams>({ ...DEFAULT_FLOW_PARAMS, ...(params as Partial<FlowParams>) });
  const disabled = !canEdit || busy;
  const set = <K extends keyof FlowParams>(key: K, v: FlowParams[K]) => setValue((prev) => ({ ...prev, [key]: v }));

  return (
    <section
      aria-label={t("PARAMS_TITLE")}
      className="space-y-4 rounded-[var(--radius)] border border-border bg-card p-4 shadow-xs"
    >
      <div>
        <h2 className="text-sm font-semibold">{t("PARAMS_TITLE")}</h2>
        <p className="text-xs text-muted-foreground">{t("PARAMS_HINT")}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {NUMBER_FIELDS.map((key) => (
          <div className="space-y-1" key={key}>
            <Label className="text-xs" htmlFor={`param-${key}`}>
              {t(`PARAM_${key}`)}
            </Label>
            <Input
              className="h-8"
              disabled={disabled}
              id={`param-${key}`}
              min={0}
              type="number"
              value={value[key]}
              onChange={(event) => set(key, Number(event.target.value))}
            />
          </div>
        ))}
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="param-paymentStartFrom">
            {t("PARAM_paymentStartFrom")}
          </Label>
          <select
            className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm"
            disabled={disabled}
            id="param-paymentStartFrom"
            value={value.paymentStartFrom}
            onChange={(event) => set("paymentStartFrom", event.target.value as FlowParams["paymentStartFrom"])}
          >
            {START_FROM.map((s) => (
              <option key={s} value={s}>
                {t(`START_${s}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs" htmlFor="param-aqlLevel">
            {t("PARAM_aqlLevel")}
          </Label>
          <Input
            className="h-8"
            disabled={disabled}
            id="param-aqlLevel"
            value={value.aqlLevel}
            onChange={(event) => set("aqlLevel", event.target.value)}
          />
        </div>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium">{t("PARAM_inspectionStages")}</legend>
        <div className="flex flex-wrap gap-3">
          {INSPECTION_STAGE_CODES.map((s) => (
            <label className="flex items-center gap-1.5 text-xs" key={s}>
              <Checkbox
                aria-label={s}
                checked={value.inspectionStages.includes(s)}
                disabled={disabled}
                onCheckedChange={(v) =>
                  set(
                    "inspectionStages",
                    v === true
                      ? INSPECTION_STAGE_CODES.filter((x) => x === s || value.inspectionStages.includes(x))
                      : value.inspectionStages.filter((x) => x !== s),
                  )
                }
              />
              {s}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium">{t("PARAM_reportReuse")}</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {REUSE_KEYS.map((k) => (
            <label className="flex items-center gap-1.5 text-xs" key={k}>
              <Checkbox
                aria-label={t(`REUSE_${k}`)}
                checked={value.reportReuse[k]}
                disabled={disabled}
                onCheckedChange={(v) => set("reportReuse", { ...value.reportReuse, [k]: v === true })}
              />
              {t(`REUSE_${k}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-xs">
        <Switch checked={value.mergeReport} disabled={disabled} onCheckedChange={(v) => set("mergeReport", v)} />
        {t("PARAM_mergeReport")}
      </label>
      {canEdit ? (
        <Button className="w-full" disabled={busy} size="sm" onClick={() => onSave(value)}>
          {t("PARAMS_SAVE")}
        </Button>
      ) : null}
    </section>
  );
}
