import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { toast } from "sonner";

import { RequirePermission } from "@/app/router/guards";
import { DetailHeaderCard, SectionCard } from "@/components/biz/detail-header-card";
import { DocNoLink } from "@/components/biz/doc-no-link";
import { ProgressTimeline, type TimelineState } from "@/components/biz/progress-timeline";
import { StatusBadge, ToneBadge } from "@/components/biz/status-badge";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader, useRouteCrumbs } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { ReuseChecks } from "@/features/testing/components/reuse-checks";
import {
  CompleteTestDialog,
  ReceiveTestDialog,
  SubmitTestDialog,
} from "@/features/testing/components/test-action-dialogs";
import { useItemLabels } from "@/features/testing/labels";
import { useTestActionMutation } from "@/features/testing/testing.mutations";
import { useReuseCheckQuery, useTestRequestQuery } from "@/features/testing/testing.queries";
import { formatDate } from "@/lib/date";
import { usePublishPageDoc } from "@/stores/page-doc.store";

import type { TestRequestDetailDto } from "@/features/testing/testing.types";
import type { DocType } from "@otd/shared";

const STEP_STATE: Record<"DONE" | "ACTIVE" | "PENDING", TimelineState> = {
  DONE: "done",
  ACTIVE: "current",
  PENDING: "pending",
};

export function TestDetailPage() {
  const { id } = useParams();
  const query = useTestRequestQuery(id);
  if (query.isLoading) return <LoadingState />;
  if (query.error || !query.data) return <ErrorState error={query.error ?? new Error("not found")} />;
  return <TestDetail request={query.data} />;
}

function TestDetail({ request: r }: { request: TestRequestDetailDto }) {
  usePublishPageDoc({ docType: "testRequest" satisfies DocType, docId: r.id, docNo: r.docNo });
  const { t } = useTranslation("testing");
  const { t: tc } = useTranslation();
  const items = useItemLabels();
  const action = useTestActionMutation();
  const reuse = useReuseCheckQuery(r.styleId, r.items);
  const crumbs = useRouteCrumbs().map((c) => (c.to ? { ...c, to: "/tests" } : c));
  const [dialog, setDialog] = useState<"submit" | "receive" | "complete" | null>(null);
  const best = reuse.data?.candidates.find((c) => c.reusable) ?? reuse.data?.candidates[0] ?? null;
  const close = (open: boolean) => !open && setDialog(null);

  async function retest() {
    try {
      const created = await action.mutateAsync({ id: r.id, action: "retest", input: { version: r.version } });
      toast.success(t("RETEST_OK", { no: created.docNo }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tc("BIZERR"));
    }
  }

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <>
            {r.status === "DRAFT" ? (
              <RequirePermission code={["testing.request.create", "testing.request.advance"]}>
                <Button onClick={() => setDialog("submit")}>{t("ACT_SUBMIT")}</Button>
              </RequirePermission>
            ) : null}
            {r.status === "AWAITING_SAMPLE" ? (
              <RequirePermission code="testing.request.advance">
                <Button onClick={() => setDialog("receive")}>{t("ACT_RECEIVE")}</Button>
              </RequirePermission>
            ) : null}
            {r.status === "TESTING" ? (
              <RequirePermission code="testing.request.result">
                <Button onClick={() => setDialog("complete")}>{t("ACT_COMPLETE")}</Button>
              </RequirePermission>
            ) : null}
            {r.status === "COMPLETED" && r.result === "FAIL" ? (
              <RequirePermission code={["testing.request.create", "testing.request.advance"]}>
                <Button disabled={action.isPending} variant="outline" onClick={() => void retest()}>
                  {t("ACT_RETEST")}
                </Button>
              </RequirePermission>
            ) : null}
          </>
        }
        crumbs={crumbs}
        extraCrumbs={[{ label: r.docNo }]}
        title={t("DETAIL_TITLE")}
      />

      <DetailHeaderCard
        fields={[
          { label: t("COL_NO"), value: r.docNo },
          { label: t("COL_CUSTOMER"), value: r.customerName },
          { label: t("F_PO"), value: r.customerPo },
          { label: t("COL_STYLE"), value: `#${r.styleNo}` },
          { label: t("F_NAME"), value: r.styleNameEn ?? r.styleNameZh, span: 2 },
          { label: t("F_COLOR_SIZE"), value: r.colorSize },
          { label: t("F_STAGE"), value: t(`STAGE_${r.stage}`) },
          { label: t("F_ENTRUST"), value: r.entrust ? t(`ENTRUST_${r.entrust}`) : null },
          { label: t("F_AGENCY"), value: r.agencyName },
          { label: t("F_SERVICE"), value: r.serviceLevel },
          { label: t("F_ITEMS"), value: items(r.items) },
          { label: t("F_STANDARD"), value: r.standard },
          { label: t("F_SAMPLE_QTY"), value: r.sampleQty !== null ? t("PAIRS", { count: r.sampleQty }) : null },
          { label: t("F_SAMPLE_SITE"), value: r.sampleSite },
          { label: t("F_SENT"), value: r.sentDate },
          { label: t("F_LAB_RECEIVED"), value: r.labReceivedDate },
          {
            label: t("F_DUE"),
            value: r.dueDate ? (
              <span className={r.overdue ? "font-medium text-danger" : undefined}>
                {r.dueDate}
                {r.overdue ? ` · ${t("OVERDUE_DAYS", { days: r.overdueDays })}` : ""}
              </span>
            ) : null,
          },
          { label: t("F_COMPLETED"), value: r.completedDate },
          { label: t("F_TRACKING"), value: r.trackingNo },
          { label: t("F_SENDER"), value: r.senderName },
          { label: t("F_FACTORY"), value: r.factoryName },
          { label: t("F_SEASON"), value: r.seasonCode },
          {
            label: t("F_RESULT"),
            value: r.result ? (
              <ToneBadge
                label={r.result === "PASS" ? t("RESULT_PASS") : t("RESULT_FAIL")}
                tone={r.result === "PASS" ? "success" : "danger"}
              />
            ) : null,
          },
          { label: t("F_FAILED_ITEMS"), value: r.failedItems },
          ...(r.correctiveAction ? [{ label: t("F_CORRECTIVE"), value: r.correctiveAction, span: 2 as const }] : []),
          ...(r.retestOf
            ? [{ label: t("F_RETEST_OF"), value: <DocNoLink no={r.retestOf.docNo} to={`/tests/${r.retestOf.id}`} /> }]
            : []),
          ...(r.retests.length
            ? [
                {
                  label: t("F_RETESTS"),
                  value: (
                    <span className="flex flex-wrap gap-2">
                      {r.retests.map((x) => (
                        <DocNoLink key={x.id} no={x.docNo} to={`/tests/${x.id}`} />
                      ))}
                    </span>
                  ),
                },
              ]
            : []),
        ]}
        imageCaption={t("IMAGE_CAPTION")}
        showImage
        subtitle={[r.customerPo, r.colorSize, r.agencyName, items(r.items)].filter(Boolean).join(" ｜ ")}
        tags={
          <>
            <ToneBadge label={r.customerName} tone="info" />
            <StatusBadge code={r.status} machine="testRequest" />
            <ToneBadge label={t(`STAGE_${r.stage}`)} />
            {r.seasonCode ? <ToneBadge label={r.seasonCode} /> : null}
            {r.reusedReport ? <ToneBadge label={t("REUSED_TAG")} tone="success" /> : null}
          </>
        }
        title={`${r.docNo} · #${r.styleNo} ${r.styleNameEn ?? r.styleNameZh}`}
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard title={t("PROGRESS_TITLE")}>
          <ProgressTimeline
            steps={r.steps.map((s) => ({
              key: s.key,
              title: t(`STEP_${s.key}`),
              state: STEP_STATE[s.state],
              ...(s.description ? { description: s.description } : {}),
              ...(s.at ? { meta: formatDate(s.at, s.at.length > 10) } : {}),
            }))}
          />
        </SectionCard>
        <SectionCard extra={t("REUSE_RULE")} title={t("REUSE_TITLE")}>
          {best ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <ToneBadge
                  label={best.reusable ? t("REUSE_AVAILABLE") : t("REUSE_NOT_AVAILABLE")}
                  tone={best.reusable ? "success" : "warning"}
                />
                <span className="tabular font-medium">{best.report.docNo}</span>
                <span className="text-muted-foreground">{best.report.agencyReportNo}</span>
              </div>
              <ReuseChecks match={best} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{reuse.isLoading ? tc("HX3QAV") : t("REUSE_EMPTY")}</p>
          )}
        </SectionCard>
      </div>

      <SectionCard title={t("RELATED_REPORTS")}>
        {r.relatedReports.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pb-2 text-left font-medium">{t("R_DOC_NO")}</th>
                  <th className="pb-2 text-left font-medium">{t("F_AGENCY_REPORT_NO")}</th>
                  <th className="pb-2 text-left font-medium">{t("F_AGENCY")}</th>
                  <th className="pb-2 text-left font-medium">{t("F_ITEMS")}</th>
                  <th className="pb-2 text-left font-medium">{t("F_ISSUED")}</th>
                  <th className="pb-2 text-left font-medium">{t("F_VALID_UNTIL")}</th>
                  <th className="pb-2 text-left font-medium">{t("F_RESULT")}</th>
                  <th className="pb-2 text-left font-medium">{t("COL_STATUS")}</th>
                </tr>
              </thead>
              <tbody>
                {r.relatedReports.map((rep) => (
                  <tr className="border-t border-border" key={rep.id}>
                    <td className="tabular py-2 font-medium">{rep.docNo}</td>
                    <td className="tabular py-2">{rep.agencyReportNo}</td>
                    <td className="py-2">{rep.agencyName ?? "—"}</td>
                    <td className="py-2">{items(rep.items)}</td>
                    <td className="tabular py-2">{rep.issuedDate}</td>
                    <td className="tabular py-2">{rep.validUntil}</td>
                    <td className="py-2">
                      <ToneBadge
                        label={rep.result === "PASS" ? t("RESULT_PASS") : t("RESULT_FAIL")}
                        tone={rep.result === "PASS" ? "success" : "danger"}
                      />
                    </td>
                    <td className="py-2">
                      <StatusBadge code={rep.status} machine="testReport" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("NO_REPORTS")}</p>
        )}
      </SectionCard>

      <SubmitTestDialog request={dialog === "submit" ? r : null} onOpenChange={close} />
      <ReceiveTestDialog request={dialog === "receive" ? r : null} onOpenChange={close} />
      <CompleteTestDialog request={dialog === "complete" ? r : null} onOpenChange={close} />
    </section>
  );
}
