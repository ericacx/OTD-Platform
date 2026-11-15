import { METRIC_DEFINITIONS, type MetricUnit, type TableDto } from "@otd/contracts/metrics";
import { MODULES, pickLabel } from "@otd/shared";
import { useTranslation } from "react-i18next";

import { ToneBadge } from "@/components/biz/status-badge";
import { cn } from "@/lib/utils";

import { formatMetric } from "./format";

type Row = TableDto["rows"][number];
type Column = TableDto["columns"][number];

const PROGRESS_MODULE: Record<string, string> = { planning: "M02", sample: "M03", testing: "M06", quote: "M04", order: "M09", shipment: "M11" };
const HEALTH_TONE: Record<string, "danger" | "warning" | "success"> = { HIGH_RISK: "danger", WATCH: "warning", STABLE: "success" };
const NUMERIC_UNITS = new Set<MetricUnit>(["count", "percent", "wan", "days"]);

export function BoardTable({ table }: { table: TableDto }) {
  const { t, i18n } = useTranslation("metrics");
  const lang = i18n.language;
  const moduleName = (code: string | undefined) => {
    const found = MODULES.find((m) => m.code === code);
    return found ? pickLabel(found.label, lang) : undefined;
  };

  function cell(column: Column, row: Row) {
    const value = row[column.key];
    const key = String(row.key ?? "");
    switch (column.key) {
      case "category":
        return t(`CAT_${key}`, { defaultValue: String(value ?? "") });
      case "stage":
        return t(`STAGE_${key.replace(".", "_")}`, { defaultValue: String(value ?? "") });
      case "module": {
        const code = typeof row.moduleCode === "string" ? row.moduleCode : PROGRESS_MODULE[key.split(".")[0] ?? ""];
        return moduleName(code) ?? String(value ?? "");
      }
      case "level": {
        const code = typeof row.levelCode === "string" ? row.levelCode : "";
        return code ? <ToneBadge label={t(`HEALTH_${code}`, { defaultValue: code })} tone={HEALTH_TONE[code] ?? "neutral"} /> : String(value ?? "—");
      }
      case "metric": {
        const def = METRIC_DEFINITIONS.find((d) => d.key === key);
        return def ? pickLabel(def.name, lang) : String(value ?? "");
      }
      default: {
        const unit = column.unit ?? (typeof row.unit === "string" && NUMERIC_UNITS.has(row.unit as MetricUnit) ? (row.unit as MetricUnit) : undefined);
        return formatMetric(value, unit);
      }
    }
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-xs" data-testid={`table-${table.key}`}>
      <div className="border-b border-border px-4 py-3 font-medium">{pickLabel(table.title, lang)}</div>
      {table.rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                {table.columns.map((c) => (
                  <th className={cn("h-11 px-4 font-medium whitespace-nowrap", c.unit && "text-right")} key={c.key} scope="col">
                    {pickLabel(c.label, lang)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, index) => (
                <tr className="border-t border-border" key={String(row.key ?? index)}>
                  {table.columns.map((c, i) => (
                    <td className={cn("px-4 py-2.5", c.unit && "tabular text-right", i === 0 && "font-medium")} key={c.key}>
                      {cell(c, row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-12 text-center text-sm text-muted-foreground">{t("TABLE_EMPTY")}</p>
      )}
    </div>
  );
}
