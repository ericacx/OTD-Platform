import { pickLabel, statusLabel, type DocType } from "@otd/shared";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

import { RequirePermission } from "@/app/router/guards";
import { DetailHeaderCard, SectionCard } from "@/components/biz/detail-header-card";
import { DocNoLink } from "@/components/biz/doc-no-link";
import { FieldGrid } from "@/components/biz/field-grid";
import { ProgressTimeline, type TimelineStep } from "@/components/biz/progress-timeline";
import { PrimaryTag, StatusBadge, ToneBadge } from "@/components/biz/status-badge";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { leafByPermission } from "@/components/common/placeholder-page";
import { DataTable } from "@/components/data-table/data-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  CancelDialog,
  ReleaseDialog,
  ResultDialog,
  ReworkDialog,
  ScheduleDialog,
} from "@/features/inspection/components/inspection-action-dialogs";
import { ReleaseGateCard } from "@/features/inspection/components/release-gate-card";
import { ConclusionBadge, stageLabel } from "@/features/inspection/inspection.labels";
import { useInspectionQuery, useReleaseCheckQuery } from "@/features/inspection/inspection.queries";
import { formatDate } from "@/lib/date";
import { formatNumber, formatPercent } from "@/lib/format";
import { usePublishPageDoc } from "@/stores/page-doc.store";

import type {
  InspectionDetailDto,
  InspectionDto,
  InspectionLogDto,
  InspectionRoundDto,
  ReleaseCheckDto,
} from "@otd/contracts/inspection";
import type { ColumnDef } from "@tanstack/react-table";
import type { TFunction } from "i18next";

type Action = "schedule" | "result" | "rework" | "cancel" | "release";

function timeline(
  d: InspectionDetailDto,
  check: ReleaseCheckDto | undefined,
  t: TFunction<"inspection">,
  locale: string,
): TimelineStep[] {
  const cancelled = d.status === "CANCELLED";
  const failed = d.result === "FAIL";
  const reworkVisible = d.rounds.length > 1 || d.status === "REWORK" || (d.status === "INSPECTED" && failed);
  const isFinal = d.stage === "FRI";
  const steps: TimelineStep[] = [
    {
      key: "schedule",
      title: t("STEP_SCHEDULE"),
      state: d.status === "TO_SCHEDULE" ? "current" : d.plannedDate ? "done" : cancelled ? "na" : "pending",
      description: [d.channel, d.plannedDate ? t("PLAN_ON", { date: d.plannedDate }) : null]
        .filter(Boolean)
        .join(" ｜ "),
      ...(d.scheduleWarning ? { meta: d.scheduleWarning } : {}),
    },
    {
      key: "execute",
      title: t("STEP_EXECUTE"),
      state: d.actualDate
        ? "done"
        : d.status === "SCHEDULED" || d.status === "REWORK"
          ? "current"
          : cancelled
            ? "na"
            : "pending",
      description: [d.actualDate, d.inspector].filter(Boolean).join(" ｜ "),
    },
    {
      key: "result",
      title: t("STEP_RESULT"),
      state: d.result ? "done" : cancelled ? "na" : "pending",
      description: d.result
        ? [d.result === "PASS" ? t("PASS") : t("FAIL"), d.defectNote, formatPercent(d.defectRate)]
            .filter(Boolean)
            .join(" · ")
        : "",
    },
    {
      key: "rework",
      title: t("STEP_REWORK"),
      state: !reworkVisible ? "na" : d.status === "REWORK" || (d.status === "INSPECTED" && failed) ? "current" : "done",
      description: reworkVisible
        ? [t("ROUND_N", { n: d.status === "REWORK" ? d.roundNo + 1 : d.roundNo }), d.correctiveAction]
            .filter(Boolean)
            .join(" · ")
        : "",
    },
    {
      key: "release",
      title: t("STEP_RELEASE"),
      gate: true,
      state:
        !isFinal || cancelled
          ? "na"
          : d.status === "RELEASED"
            ? "done"
            : d.status === "INSPECTED"
              ? check?.passed
                ? "current"
                : "blocked"
              : "pending",
      description: !isFinal
        ? t("GATE_NOTE_MID")
        : d.status === "RELEASED"
          ? [formatDate(d.releasedAt, true), d.concession ? t("CONCESSION_TAG") : null].filter(Boolean).join(" · ")
          : check && !check.passed
            ? check.items
                .filter((i) => i.applicable && !i.passed)
                .map((i) => pickLabel(i.label, locale))
                .join("、")
            : "",
    },
  ];
  return steps;
}

export function InspectionDetailPage() {
  const { id = "" } = useParams();
  const { t, i18n } = useTranslation("inspection");
  const detail = useInspectionQuery(id);
  const check = useReleaseCheckQuery(id);
  usePublishPageDoc(
    detail.data ? { docType: "inspection" satisfies DocType, docId: detail.data.id, docNo: detail.data.docNo } : null,
  );
  const [action, setAction] = useState<Action | null>(null);
  const { group, leaf } = leafByPermission("inspection.inspection.view");

  const roundColumns = useMemo<ColumnDef<InspectionRoundDto, unknown>[]>(
    () => [
      { id: "round", header: t("ROUND"), cell: ({ row }) => t("ROUND_N", { n: row.original.roundNo }) },
      {
        id: "result",
        header: t("RESULT"),
        cell: ({ row }) => <ConclusionBadge result={row.original.result === "PASS" ? "PASS" : "FAIL"} />,
      },
      { accessorKey: "actualDate", header: t("ACTUAL_DATE") },
      { id: "sample", header: t("ACTUAL_SAMPLE"), cell: ({ row }) => formatNumber(row.original.actualSampleQty) },
      { id: "defects", header: t("DEFECT_QTY"), cell: ({ row }) => formatNumber(row.original.defectQty) },
      { id: "rate", header: t("DEFECT_RATE"), cell: ({ row }) => formatPercent(row.original.defectRate) },
      { id: "note", header: t("DEFECT_NOTE"), cell: ({ row }) => row.original.defectNote ?? "—" },
      { id: "action", header: t("CORRECTIVE_ACTION"), cell: ({ row }) => row.original.correctiveAction ?? "—" },
    ],
    [t],
  );
  const logColumns = useMemo<ColumnDef<InspectionLogDto, unknown>[]>(
    () => [
      {
        id: "date",
        header: t("LOG_DATE"),
        cell: ({ row }) => <span className="tabular">{formatDate(row.original.at)}</span>,
      },
      {
        id: "time",
        header: t("LOG_TIME"),
        cell: ({ row }) => <span className="tabular">{formatDate(row.original.at, true).slice(11)}</span>,
      },
      {
        id: "action",
        header: t("LOG_ACTION"),
        cell: ({ row }) =>
          t(`ACTION_${row.original.action.toUpperCase()}` as "ACTION_CREATE", { defaultValue: row.original.action }),
      },
      {
        id: "change",
        header: t("LOG_CHANGE"),
        cell: ({ row }) =>
          row.original.fromStatus === row.original.toStatus
            ? "—"
            : [row.original.fromStatus, row.original.toStatus]
                .map((s) => (s ? pickLabel(statusLabel("inspection", s), i18n.language) : t("LOG_NEW")))
                .join(" → "),
      },
      { id: "note", header: t("LOG_NOTE"), cell: ({ row }) => row.original.note ?? "—" },
      { id: "operator", header: t("LOG_OPERATOR"), cell: ({ row }) => row.original.operatorName ?? "—" },
    ],
    [t, i18n.language],
  );
  const sameColumns = useMemo<ColumnDef<InspectionDto, unknown>[]>(
    () => [
      {
        id: "docNo",
        header: t("DOC_NO"),
        cell: ({ row }) =>
          row.original.id === id ? (
            <DocNoLink no={row.original.docNo} />
          ) : (
            <DocNoLink no={row.original.docNo} to={`/inspections/${row.original.id}`} />
          ),
      },
      { id: "stage", header: t("STAGE"), cell: ({ row }) => stageLabel(row.original.stage, i18n.language) },
      { id: "round", header: t("ROUND"), cell: ({ row }) => t("ROUND_N", { n: row.original.roundNo }) },
      { id: "actual", header: t("ACTUAL_DATE"), cell: ({ row }) => formatDate(row.original.actualDate) },
      { id: "result", header: t("RESULT"), cell: ({ row }) => <ConclusionBadge result={row.original.result} /> },
      {
        id: "status",
        header: t("STATUS"),
        cell: ({ row }) => <StatusBadge code={row.original.status} machine="inspection" />,
      },
    ],
    [t, i18n.language, id],
  );

  if (detail.isLoading) return <LoadingState />;
  if (detail.error || !detail.data) return <ErrorState error={detail.error} />;
  const d = detail.data;
  const isFinal = d.stage === "FRI";
  const nextRound = d.status === "REWORK" ? d.roundNo + 1 : d.roundNo;

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <>
            {d.status === "TO_SCHEDULE" ? (
              <RequirePermission code="inspection.schedule.edit">
                <Button variant="outline" onClick={() => setAction("schedule")}>
                  {t("SCHEDULE")}
                </Button>
              </RequirePermission>
            ) : null}
            {d.status === "SCHEDULED" || d.status === "REWORK" ? (
              <RequirePermission code="inspection.inspection.result">
                <Button variant="outline" onClick={() => setAction("result")}>
                  {t("RECORD_RESULT")}
                </Button>
              </RequirePermission>
            ) : null}
            <RequirePermission code="inspection.inspection.rework">
              <Button
                disabled={!(d.status === "INSPECTED" && d.result === "FAIL")}
                variant="outline"
                onClick={() => setAction("rework")}
              >
                {t("REWORK")}
              </Button>
            </RequirePermission>
            <RequirePermission code="inspection.inspection.cancel">
              <Button
                disabled={!(d.status === "TO_SCHEDULE" || d.status === "SCHEDULED")}
                variant="outline"
                onClick={() => setAction("cancel")}
              >
                {t("CANCEL")}
              </Button>
            </RequirePermission>
            <RequirePermission code="inspection.inspection.release">
              <Button disabled={!(isFinal && d.status === "INSPECTED")} onClick={() => setAction("release")}>
                {t("RELEASE")}
              </Button>
            </RequirePermission>
          </>
        }
        crumbs={[
          { label: pickLabel(group.label, i18n.language) },
          { label: pickLabel(leaf.label, i18n.language), to: "/inspections" },
          { label: d.docNo },
        ]}
        title={t("DETAIL_TITLE")}
      />
      {d.status === "CANCELLED" && d.cancelReason ? (
        <Alert>
          <AlertDescription>{t("CANCELLED_NOTE", { reason: d.cancelReason })}</AlertDescription>
        </Alert>
      ) : null}
      <DetailHeaderCard
        fields={[
          { label: t("DOC_NO"), value: <span className="tabular">{d.docNo}</span> },
          { label: t("CUSTOMER"), value: d.customerName },
          { label: t("PO"), value: <span className="tabular">{d.poNo}</span> },
          { label: t("STYLE"), value: d.styleNo ? `#${d.styleNo}` : t("STYLE_ALL") },
          { label: t("STYLE_NAME"), value: d.styleName },
          { label: t("COLOR"), value: d.color },
          { label: t("STAGE"), value: stageLabel(d.stage, i18n.language) },
          { label: t("FACTORY"), value: d.factoryName },
          { label: t("SEASON"), value: d.seasonCode },
          { label: t("PLANNED_DATE"), value: formatDate(d.plannedDate) },
          { label: t("ACTUAL_DATE"), value: formatDate(d.actualDate) },
          { label: t("EX_FACTORY"), value: formatDate(d.plannedExFactory) },
          { label: t("METHOD"), value: d.method },
          { label: t("INSPECTOR"), value: d.inspector },
          { label: t("CHANNEL"), value: d.channel },
          { label: t("AQL"), value: d.aql },
          { label: t("GRANULARITY"), value: d.granularity },
          { label: t("ORDER_QTY"), value: d.orderQty != null ? t("PAIRS", { n: formatNumber(d.orderQty) }) : null },
          { label: t("CARTON_COUNT"), value: d.cartonCount != null ? formatNumber(d.cartonCount) : null },
          { label: t("PRODUCTION_RATE"), value: d.productionRate != null ? formatPercent(d.productionRate, 0) : null },
          { label: t("PACKING_RATE"), value: d.packingRate != null ? formatPercent(d.packingRate, 0) : null },
          { label: t("OWNER"), value: d.ownerName },
          { label: t("REQUIREMENTS"), value: d.requirements, span: 2 },
        ]}
        showImage
        subtitle={[d.poNo, d.color, d.factoryName, d.channel].filter(Boolean).join(" ｜ ")}
        tags={
          <>
            <ToneBadge label={d.customerName} tone="info" />
            <StatusBadge code={d.status} machine="inspection" />
            <PrimaryTag>{stageLabel(d.stage, i18n.language)}</PrimaryTag>
            {d.seasonCode ? <PrimaryTag>{d.seasonCode}</PrimaryTag> : null}
            <ToneBadge
              label={nextRound > 1 ? t("ROUND_RE", { n: nextRound }) : t("ROUND_N", { n: nextRound })}
              tone={nextRound > 1 ? "warning" : "neutral"}
            />
            {d.concession ? <ToneBadge label={t("CONCESSION_TAG")} tone="warning" /> : null}
          </>
        }
        title={`${d.docNo}${d.styleNo ? ` · #${d.styleNo}` : ""}${d.styleNameEn ? ` ${d.styleNameEn}` : d.styleName ? ` ${d.styleName}` : ""}`}
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard title={t("RESULT_CARD")}>
          <FieldGrid
            columns={2}
            items={[
              { label: t("RESULT"), value: <ConclusionBadge result={d.result} /> },
              {
                label: t("ROUND"),
                value: d.roundNo > 1 ? t("ROUND_RE", { n: d.roundNo }) : t("ROUND_N", { n: d.roundNo }),
              },
              {
                label: t("SAMPLE_PLAN_ACTUAL"),
                value: `${formatNumber(d.plannedSampleQty)} / ${formatNumber(d.actualSampleQty)}`,
              },
              {
                label: t("DEFECT_QTY"),
                value:
                  d.defectQty != null ? (
                    <b className={d.defectQty > 0 ? "text-danger" : undefined}>{formatNumber(d.defectQty)}</b>
                  ) : null,
              },
              {
                label: t("DEFECT_RATE"),
                value:
                  d.defectRate != null ? (
                    <b className={d.defectRate > 0 ? "text-danger" : undefined}>{formatPercent(d.defectRate)}</b>
                  ) : null,
              },
              { label: t("PRECONDITIONS"), value: d.preconditions.length ? d.preconditions.join(" / ") : null },
              { label: t("DEFECT_NOTE"), value: d.defectNote, span: "full" },
              { label: t("CORRECTIVE_ACTION"), value: d.correctiveAction, span: "full" },
              ...(d.concessionReason
                ? [{ label: t("CONCESSION_REASON"), value: d.concessionReason, span: "full" as const }]
                : []),
            ]}
          />
        </SectionCard>
        <ReleaseGateCard check={check.data} inspection={d} />
      </div>
      <SectionCard title={t("PROGRESS_CARD")}>
        <ProgressTimeline steps={timeline(d, check.data, t, i18n.language)} />
      </SectionCard>
      {d.rounds.length ? (
        <SectionCard bodyClassName="p-0" title={t("ROUNDS_CARD")}>
          <DataTable columns={roundColumns} data={d.rounds} getRowId={(r) => String(r.roundNo)} />
        </SectionCard>
      ) : null}
      <SectionCard bodyClassName="p-0" title={t("LOGS_CARD")}>
        <DataTable columns={logColumns} data={d.logs} getRowId={(r) => r.id} />
      </SectionCard>
      <SectionCard bodyClassName="p-0" title={t("SAME_ORDER_CARD")}>
        <DataTable columns={sameColumns} data={d.sameOrder} getRowId={(r) => r.id} />
      </SectionCard>
      {action === "schedule" ? <ScheduleDialog inspection={d} onClose={() => setAction(null)} /> : null}
      {action === "result" ? <ResultDialog inspection={d} onClose={() => setAction(null)} /> : null}
      {action === "rework" ? <ReworkDialog inspection={d} onClose={() => setAction(null)} /> : null}
      {action === "cancel" ? <CancelDialog inspection={d} onClose={() => setAction(null)} /> : null}
      {action === "release" ? <ReleaseDialog inspection={d} onClose={() => setAction(null)} /> : null}
    </section>
  );
}
