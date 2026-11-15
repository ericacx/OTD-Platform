import { pickLabel } from "@otd/shared";
import { useTranslation } from "react-i18next";

import { KpiCard } from "@/components/biz/kpi-card";

import type { KpiDto } from "@otd/contracts/metrics";

export function KpiGrid({ kpis }: { kpis: KpiDto[] }) {
  const { i18n } = useTranslation();
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      {kpis.map((kpi) => (
        <KpiCard hint={pickLabel(kpi.sub, i18n.language)} key={kpi.key} label={pickLabel(kpi.label, i18n.language)} tone={kpi.tone ?? "default"} value={kpi.display} />
      ))}
    </div>
  );
}
