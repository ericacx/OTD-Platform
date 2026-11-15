import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import type { PatrolDashboardDto } from "@otd/contracts/patrol";

type LegendProps = { legend: PatrolDashboardDto["legend"] };

export function PatrolLegend({ legend }: LegendProps) {
  const { t } = useTranslation("patrol");
  const items = [
    { key: "red", dot: "bg-danger", label: t("LEGEND_RED"), value: legend.red, desc: t("LEGEND_RED_DESC") },
    { key: "yellow", dot: "bg-warning", label: t("LEGEND_YELLOW"), value: legend.yellow, desc: t("LEGEND_YELLOW_DESC") },
    { key: "green", dot: "bg-success", label: t("LEGEND_GREEN"), value: legend.greenModules, desc: t("LEGEND_GREEN_DESC", { scanned: legend.scannedModules }) },
  ];
  return (
    <ul
      aria-label={t("LEGEND")}
      className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-[var(--radius)] border border-border bg-card px-4 py-3 text-sm shadow-xs"
    >
      {items.map((item) => (
        <li className="flex items-center gap-2" data-testid={`legend-${item.key}`} key={item.key}>
          <span aria-hidden="true" className={cn("size-2.5 rounded-full", item.dot)} />
          <span>{item.label}</span>
          <b className="tabular text-base">{item.value}</b>
          <span className="text-muted-foreground">{item.desc}</span>
        </li>
      ))}
    </ul>
  );
}
