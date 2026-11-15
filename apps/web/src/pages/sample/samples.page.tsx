import { ROUND_STATUSES, ROUND_TYPES } from "@otd/contracts/sample";
import { AlarmClock, Hourglass, Layers, Timer } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { KpiCard } from "@/components/biz/kpi-card";
import { StatusBadge, ToneBadge } from "@/components/biz/status-badge";
import { PageHeader } from "@/components/common/page-header";
import { ServerDataTable } from "@/components/data-table/server-data-table";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { useDictLabel } from "@/features/planning/dict";
import { useSamplesQuery } from "@/features/sample/sample.queries";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";
import { cn } from "@/lib/utils";

import type { SampleSummaryDto } from "@/features/sample/sample.types";
import type { ColumnDef } from "@tanstack/react-table";

const SELECT = "h-9 rounded-md border border-input bg-card px-2 text-sm";
const OPEN = new Set(["ISSUED", "RECEIVING", "SOURCING", "KNITTING", "QC", "READY", "SHIPPED"]);
const STUCK_DAYS = 7;

export function SamplesPage() {
  const { t } = useTranslation("sample");
  const dict = useDictLabel();
  const query = useTableQueryState();
  const samples = useSamplesQuery(query.params);
  const all = useSamplesQuery({ pageSize: 200 });
  const lookups = useLookups();
  const [now] = useState(() => Date.now());

  const kpi = useMemo(() => {
    const items = all.data?.items ?? [];
    const open = items.filter((s) => s.currentRound && OPEN.has(s.currentRound.status));
    return {
      open: open.length,
      dueSoon: open.filter((s) => s.remainingDays !== null && s.remainingDays >= 0 && s.remainingDays <= 7).length,
      slow: open.filter((s) => s.currentRound?.progress === "SLOW").length,
      stuck: items.filter(
        (s) =>
          s.currentRound?.status === "ISSUED" &&
          now - new Date(s.currentRound.stageEnteredAt).getTime() > STUCK_DAYS * 86_400_000,
      ).length,
      awaiting: items.filter((s) => s.currentRound?.status === "AWAITING_APPROVAL").length,
    };
  }, [all.data, now]);

  const columns = useMemo<ColumnDef<SampleSummaryDto, unknown>[]>(
    () => [
      {
        id: "no",
        header: t("COL_NO"),
        cell: ({ row }) => (
          <div className="leading-tight">
            <Link
              className="tabular font-semibold whitespace-nowrap text-primary hover:underline"
              to={`/samples/${row.original.id}`}
            >
              {row.original.docNo}
            </Link>
            <div className="max-w-[260px] truncate text-xs text-muted-foreground">
              #{row.original.styleNo} · {row.original.styleNameZh}
            </div>
          </div>
        ),
      },
      { id: "customer", header: t("COL_CUSTOMER"), cell: ({ row }) => row.original.customerName },
      {
        id: "round",
        header: t("COL_ROUND"),
        cell: ({ row }) =>
          row.original.currentRound
            ? t("ROUND_LABEL", {
                type: dict("roundType", row.original.currentRound.roundType),
                no: row.original.currentRound.roundNo,
              })
            : "—",
      },
      {
        id: "stage",
        header: t("COL_STAGE"),
        cell: ({ row }) => <StatusBadge code={row.original.currentRound?.status} machine="sampleRound" />,
      },
      {
        id: "progress",
        header: t("COL_PROGRESS"),
        cell: ({ row }) =>
          row.original.currentRound && OPEN.has(row.original.currentRound.status) ? (
            <ToneBadge
              label={row.original.currentRound.progress === "SLOW" ? t("PROGRESS_SLOW") : t("PROGRESS_NORMAL")}
              tone={row.original.currentRound.progress === "SLOW" ? "danger" : "success"}
            />
          ) : (
            "—"
          ),
      },
      { id: "factory", header: t("COL_FACTORY"), cell: ({ row }) => row.original.factoryName ?? "—" },
      {
        id: "due",
        header: t("COL_DUE"),
        cell: ({ row }) => (
          <div className="leading-tight">
            <div className="tabular">{row.original.dueDate ?? "—"}</div>
            {row.original.remainingDays !== null &&
            row.original.currentRound &&
            OPEN.has(row.original.currentRound.status) ? (
              <div className={cn("text-xs", row.original.remainingDays < 0 ? "text-danger" : "text-muted-foreground")}>
                {row.original.remainingDays < 0
                  ? t("OVERDUE_DAYS", { days: -row.original.remainingDays })
                  : t("REMAINING_DAYS", { days: row.original.remainingDays })}
              </div>
            ) : null}
          </div>
        ),
      },
      { id: "owner", header: t("COL_OWNER"), cell: ({ row }) => row.original.ownerName },
    ],
    [t, dict],
  );

  return (
    <section className="space-y-5">
      <PageHeader title={t("LIST_TITLE")} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          hint={t("KPI_OPEN_HINT", { count: kpi.dueSoon })}
          icon={Layers}
          label={t("KPI_OPEN")}
          unit={t("UNIT_STYLE")}
          value={kpi.open}
        />
        <KpiCard hint={t("KPI_SLOW_HINT")} icon={Timer} label={t("KPI_SLOW")} tone="warning" value={kpi.slow} />
        <KpiCard
          hint={t("KPI_STUCK_HINT", { days: STUCK_DAYS })}
          icon={AlarmClock}
          label={t("KPI_STUCK")}
          tone="danger"
          value={kpi.stuck}
        />
        <KpiCard hint={t("KPI_AWAITING_HINT")} icon={Hourglass} label={t("KPI_AWAITING")} value={kpi.awaiting} />
      </div>
      <ServerDataTable
        columns={columns}
        error={samples.error}
        getRowId={(row) => row.id}
        isLoading={samples.isLoading}
        page={samples.data}
        query={query}
        searchPlaceholder={t("SEARCH")}
        toolbar={
          <>
            <select
              aria-label={t("COL_STAGE")}
              className={SELECT}
              value={query.filters.status ?? ""}
              onChange={(e) => query.setFilter("status", e.target.value || undefined)}
            >
              <option value="">{t("ALL_STAGES")}</option>
              {ROUND_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`ST_${s}`)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("ROUND_TYPE")}
              className={SELECT}
              value={query.filters.roundType ?? ""}
              onChange={(e) => query.setFilter("roundType", e.target.value || undefined)}
            >
              <option value="">{t("ALL_TYPES")}</option>
              {ROUND_TYPES.map((r) => (
                <option key={r} value={r}>
                  {dict("roundType", r)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("COL_FACTORY")}
              className={SELECT}
              value={query.filters.factoryId ?? ""}
              onChange={(e) => query.setFilter("factoryId", e.target.value || undefined)}
            >
              <option value="">{t("ALL_FACTORIES")}</option>
              {(lookups.data?.factories ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </>
        }
      />
    </section>
  );
}
