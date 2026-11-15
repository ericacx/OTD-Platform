import { SEVERITIES, pickLabel } from "@otd/shared";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { StatusBadge, ToneBadge } from "@/components/biz/status-badge";
import { TrafficLight } from "@/components/biz/traffic-light";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { PatrolHitDto } from "@otd/contracts/patrol";

type HitsTableProps = {
  hits: PatrolHitDto[];
  canHandle: boolean;
  pendingId: string | null;
  onStart: (hit: PatrolHitDto) => void;
  onClose: (hit: PatrolHitDto) => void;
};

export function HitsTable({ hits, canHandle, pendingId, onStart, onClose }: HitsTableProps) {
  const { t, i18n } = useTranslation("patrol");
  const lang = i18n.language;
  const overdueText = (days: number) => (days > 0 ? t("OVERDUE_DAYS", { days }) : days < 0 ? t("LEFT_DAYS", { days: -days }) : t("DUE_TODAY"));
  if (!hits.length) return <p className="py-12 text-center text-sm text-muted-foreground">{t("EMPTY_HITS")}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] text-sm">
        <thead className="bg-muted text-left text-muted-foreground">
          <tr>
            <th className="h-11 px-4 font-medium">{t("COL_MODULE")}</th>
            <th className="px-4 font-medium">{t("COL_RULE")}</th>
            <th className="px-4 font-medium">{t("COL_OBJECT")}</th>
            <th className="px-4 font-medium">{t("COL_MESSAGE")}</th>
            <th className="px-4 font-medium">{t("COL_OVERDUE")}</th>
            <th className="px-4 font-medium">{t("COL_SEVERITY")}</th>
            <th className="px-4 font-medium">{t("COL_STATUS")}</th>
            <th className="px-4 font-medium">{t("COL_ACTION")}</th>
          </tr>
        </thead>
        <tbody>
          {hits.map((hit) => {
            const severity = SEVERITIES[hit.severity];
            const red = hit.light === "RED";
            const open = hit.status !== "CLOSED";
            return (
              <tr className="border-t border-border align-top" data-testid={`hit-${hit.id}`} key={hit.id}>
                <td className="px-4 py-3 font-medium whitespace-nowrap">{pickLabel(hit.moduleLabel, lang)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span>{pickLabel(hit.ruleName, lang)}</span>
                    <ToneBadge label={red ? t("TAG_OVERDUE") : t("TAG_WARNING")} tone={red ? "danger" : "warning"} />
                  </div>
                  <TrafficLight className="mt-1 text-xs text-muted-foreground" light={hit.light} />
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{hit.targetNo ?? "—"}</div>
                  {hit.targetName ? <div className="text-xs text-muted-foreground">{hit.targetName}</div> : null}
                  {hit.customerName ? <div className="text-xs text-muted-foreground">{hit.customerName}</div> : null}
                </td>
                <td className="max-w-80 px-4 py-3 text-xs text-muted-foreground">{pickLabel(hit.message, lang)}</td>
                <td className={cn("px-4 py-3 font-medium whitespace-nowrap", red ? "text-danger" : "text-warning")}>{overdueText(hit.overdueDays)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <ToneBadge label={pickLabel(severity.label, lang)} tone={severity.tone} />
                  <div className="mt-1 text-xs text-muted-foreground">
                    {[hit.assigneeRoleLabel ? pickLabel(hit.assigneeRoleLabel, lang) : null, hit.assigneeName].filter(Boolean).join(" · ")}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge code={hit.status} machine="patrolHit" />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    {hit.link ? (
                      <Link className="text-primary hover:underline" to={hit.link}>
                        {t("GO_HANDLE")}
                      </Link>
                    ) : null}
                    {canHandle && hit.status === "OPEN" ? (
                      <Button className="h-auto px-0" disabled={pendingId === hit.id} variant="link" onClick={() => onStart(hit)}>
                        {t("START")}
                      </Button>
                    ) : null}
                    {canHandle && open ? (
                      <Button className="h-auto px-0 text-muted-foreground" disabled={pendingId === hit.id} variant="link" onClick={() => onClose(hit)}>
                        {t("CLOSE")}
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
