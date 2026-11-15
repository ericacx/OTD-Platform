import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { SourceTag } from "./source-tag";

import type { CapacityCompareDto, CapacityRowDto } from "../capacity.types";

const fmt = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined
    ? "—"
    : n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });

export function percent(rate: number | null | undefined): string {
  return rate === null || rate === undefined ? "—" : `${(rate * 100).toFixed(1)}%`;
}

type Props = {
  rows: CapacityRowDto[];
  compare?: CapacityCompareDto | undefined;
  editable: boolean;
  onEdit: (row: CapacityRowDto) => void;
  onBacklog: (row: CapacityRowDto) => void;
};

export function KnitTable({ rows, compare, editable, onEdit, onBacklog }: Props) {
  const { t } = useTranslation("capacity");
  const delta = (row: CapacityRowDto) => {
    const hit = compare?.rows.find((r) => r.key === `KNIT:${row.baseId}:${row.needleTypeId ?? ""}:`);
    if (!hit) return null;
    if (hit.change === "ADDED") return { text: t("CMP_ADDED"), tone: "text-info" };
    const field = hit.fields.find((f) => f.field === "spareCapacity");
    if (!field || field.delta === null) return { text: "0", tone: "text-muted-foreground" };
    return {
      text: `${field.delta > 0 ? "+" : ""}${fmt(field.delta)}`,
      tone: field.delta < 0 ? "text-danger" : "text-success",
    };
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted text-muted-foreground">
          <tr className="[&>th]:h-10 [&>th]:px-3 [&>th]:font-medium [&>th]:whitespace-nowrap">
            <th className="text-left">{t("BASE")}</th>
            <th className="text-left">{t("NEEDLE")}</th>
            <th className="text-right">{t("LEAD_DAYS")}</th>
            <th className="text-right">{t("AVAILABLE_DAYS")}</th>
            <th className="text-right">{t("MACHINES")}</th>
            <th className="text-right">{t("DAILY_OUTPUT")}</th>
            <th className="text-right">{t("CUMULATIVE")}</th>
            <th className="text-right">{t("UNPRODUCED")}</th>
            <th className="text-right">{t("SPARE")}</th>
            <th className="text-right">{t("SPARE_RATE")}</th>
            {compare ? <th className="text-right">{t("CMP_DELTA")}</th> : null}
            {editable ? <th className="text-left">{t("ACTIONS")}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const d = delta(r);
            return (
              <tr
                className={cn("border-t border-border [&>td]:px-3 [&>td]:py-2", r.tight && "bg-warning/10")}
                data-tight={r.tight || undefined}
                key={r.id}
              >
                <td className="whitespace-nowrap">{r.baseName}</td>
                <td className="font-medium">{r.needleCode}</td>
                <td className="text-right">
                  <span className="inline-flex items-center gap-1">
                    <span className="tabular">{r.leadDays ?? "—"}</span>
                    {r.sources.leadDays === "MANUAL" ? <SourceTag source="MANUAL" /> : null}
                  </span>
                </td>
                <td className="tabular text-right">{r.availableDays ?? "—"}</td>
                <td className="text-right">
                  <span className="inline-flex items-center gap-1">
                    <span className="tabular">{fmt(r.machineCount)}</span>
                    <SourceTag source={r.sources.machineCount} />
                  </span>
                </td>
                <td className="text-right">
                  <span className="inline-flex items-center gap-1">
                    <span className="tabular">{fmt(r.dailyOutput, 1)}</span>
                    <SourceTag source={r.sources.dailyOutput} />
                  </span>
                </td>
                <td className="tabular text-right">{fmt(r.cumulativeCapacity)}</td>
                <td className="text-right">
                  <span
                    className="inline-flex items-center gap-1"
                    title={t("UNPRODUCED_SPLIT", { otd: fmt(r.otdUnproducedQty), erp: fmt(r.erpBacklog) })}
                  >
                    <span className="tabular">{fmt(r.unproducedQty)}</span>
                    <SourceTag source={r.sources.unproducedQty} />
                  </span>
                </td>
                <td className="tabular text-right font-semibold">{fmt(r.spareCapacity)}</td>
                <td className={cn("tabular text-right font-semibold", r.tight && "text-danger")}>
                  {percent(r.spareRate)}
                </td>
                {compare ? <td className={cn("tabular text-right", d?.tone)}>{d?.text ?? "—"}</td> : null}
                {editable ? (
                  <td className="whitespace-nowrap">
                    <Button className="h-auto px-1" variant="link" onClick={() => onEdit(r)}>
                      {t("ROW_EDIT")}
                    </Button>
                    <Button className="h-auto px-1" variant="link" onClick={() => onBacklog(r)}>
                      {t("ROW_BACKLOG")}
                    </Button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
