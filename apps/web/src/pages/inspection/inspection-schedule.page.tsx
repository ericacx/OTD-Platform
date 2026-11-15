import { CalendarDays } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { RequirePermission } from "@/app/router/guards";
import { SectionCard } from "@/components/biz/detail-header-card";
import { DocNoLink } from "@/components/biz/doc-no-link";
import { StatusBadge, ToneBadge } from "@/components/biz/status-badge";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScheduleDialog } from "@/features/inspection/components/inspection-action-dialogs";
import { stageLabel } from "@/features/inspection/inspection.labels";
import { useInspectionScheduleQuery } from "@/features/inspection/inspection.queries";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";

import type { InspectionDto, InspectionScheduleViewDto } from "@otd/contracts/inspection";

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

type Day = InspectionScheduleViewDto["days"][number];

export function InspectionSchedulePage() {
  const { t, i18n } = useTranslation("inspection");
  const lookups = useLookups();
  const [from, setFrom] = useState(() => formatDate(new Date()));
  const [to, setTo] = useState(() => addDays(formatDate(new Date()), 13));
  const [factoryId, setFactoryId] = useState("");
  const view = useInspectionScheduleQuery({ from, to, factoryId: factoryId || undefined });
  const [scheduling, setScheduling] = useState<InspectionDto | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, Day[]>();
    for (const day of view.data?.days ?? []) map.set(day.date, [...(map.get(day.date) ?? []), day]);
    return [...map.entries()];
  }, [view.data]);

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label={t("FROM")}
              className="h-9 w-40"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <span className="text-muted-foreground">~</span>
            <Input
              aria-label={t("TO")}
              className="h-9 w-40"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            <select
              aria-label={t("FACTORY")}
              className="h-9 rounded-md border border-input bg-card px-2 text-sm"
              value={factoryId}
              onChange={(e) => setFactoryId(e.target.value)}
            >
              <option value="">{t("ALL_FACTORIES")}</option>
              {(lookups.data?.factories ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        }
        description={t("SCHEDULE_PAGE_DESC", { limit: view.data?.limit ?? 5 })}
        title={t("SCHEDULE_PAGE_TITLE")}
      />
      {view.isLoading ? <LoadingState /> : null}
      {view.error ? <ErrorState error={view.error} /> : null}
      {view.data ? (
        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <SectionCard
            bodyClassName="p-3"
            extra={t("COUNT_ITEMS", { count: view.data.unscheduled.length })}
            title={t("UNSCHEDULED")}
          >
            {view.data.unscheduled.length === 0 ? (
              <EmptyState className="border-0" title={t("UNSCHEDULED_EMPTY")} />
            ) : (
              <ul className="space-y-2">
                {view.data.unscheduled.map((row) => (
                  <li className="rounded-lg border border-border p-3" key={row.id}>
                    <div className="flex items-center justify-between gap-2">
                      <DocNoLink no={row.docNo} to={`/inspections/${row.id}`} />
                      <ToneBadge label={stageLabel(row.stage, i18n.language)} tone="info" />
                    </div>
                    <p className="mt-1 text-sm">
                      {row.customerName} · {row.poNo}
                      {row.styleNo ? ` · #${row.styleNo}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.factoryName ?? "—"} · {t("EX_FACTORY")} {formatDate(row.plannedExFactory)}
                    </p>
                    <RequirePermission code="inspection.schedule.edit">
                      <Button className="mt-2" size="sm" variant="outline" onClick={() => setScheduling(row)}>
                        {t("SCHEDULE")}
                      </Button>
                    </RequirePermission>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard bodyClassName="p-0" title={t("CALENDAR")}>
            {byDate.length === 0 ? (
              <EmptyState className="border-0" icon={CalendarDays} title={t("CALENDAR_EMPTY")} />
            ) : (
              <ol className="divide-y divide-border">
                {byDate.map(([date, days]) => (
                  <li className="grid gap-3 px-5 py-4 md:grid-cols-[120px_1fr]" key={date}>
                    <div className="tabular font-semibold">{date}</div>
                    <div className="space-y-3">
                      {days.map((day) => (
                        <div className="rounded-lg border border-border p-3" key={`${date}-${day.factoryId ?? ""}`}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{day.factoryName ?? "—"}</span>
                            <ToneBadge
                              label={t("SLOT_USAGE", { count: day.styleCount, limit: day.limit })}
                              tone={day.full ? "danger" : "success"}
                            />
                            {day.full ? <span className="text-xs text-danger">{t("SLOT_FULL")}</span> : null}
                          </div>
                          <ul className="mt-2 flex flex-wrap gap-2">
                            {day.items.map((item) => (
                              <li
                                className={cn(
                                  "flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs",
                                )}
                                key={item.id}
                              >
                                <DocNoLink no={item.docNo} to={`/inspections/${item.id}`} />
                                <span>{stageLabel(item.stage, i18n.language)}</span>
                                {item.styleNo ? <span>#{item.styleNo}</span> : null}
                                <span className="text-muted-foreground">{item.customerName}</span>
                                <StatusBadge code={item.status} machine="inspection" />
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>
        </div>
      ) : null}
      {scheduling ? <ScheduleDialog inspection={scheduling} onClose={() => setScheduling(null)} /> : null}
    </section>
  );
}
