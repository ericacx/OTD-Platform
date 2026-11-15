import { pickLabel } from "@otd/shared";
import { Diamond, Download, FileText, Lock } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

import { useAuth } from "@/app/providers/auth-provider";
import { RequirePermission } from "@/app/router/guards";
import { DetailHeaderCard, SectionCard } from "@/components/biz/detail-header-card";
import { FieldGrid } from "@/components/biz/field-grid";
import { FileUpload } from "@/components/biz/file-upload";
import { StatusBadge, ToneBadge } from "@/components/biz/status-badge";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { leafByPermission } from "@/components/common/placeholder-page";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { HandoverChangeDialog } from "@/features/document/components/handover-change-dialog";
import { HandoverChecklist } from "@/features/document/components/handover-checklist";
import { useCompleteHandoverMutation, useHandoverTechPackMutation } from "@/features/document/document.mutations";
import { useHandoverQuery } from "@/features/document/document.queries";
import { downloadFile } from "@/features/quote/quote.mutations";
import { formatDate } from "@/lib/date";

export function HandoverDetailPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation("document");
  const { t: tc } = useTranslation();
  const { hasPermission } = useAuth();
  const handoverQuery = useHandoverQuery(id);
  const complete = useCompleteHandoverMutation();
  const techPack = useHandoverTechPackMutation();
  const [confirming, setConfirming] = useState(false);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { leaf, group } = leafByPermission("document.handover.view");

  if (handoverQuery.isLoading) return <LoadingState />;
  if (handoverQuery.error || !handoverQuery.data)
    return <ErrorState error={handoverQuery.error ?? new Error(tc("STERR"))} />;
  const h = handoverQuery.data;
  const frozen = h.status === "HANDED_OVER";

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("BIZERR"));
    }
  }

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <>
            {!frozen ? (
              <RequirePermission code="document.handover.complete">
                <Button
                  disabled={!h.ready}
                  title={h.ready ? undefined : t("COMPLETE_BLOCKED", { missing: h.missing.join("、") })}
                  onClick={() => setConfirming(true)}
                >
                  {t("COMPLETE")}
                </Button>
              </RequirePermission>
            ) : (
              <RequirePermission code="document.handover.change">
                <Button variant="outline" onClick={() => setChanging(true)}>
                  {t("CHANGE")}
                </Button>
              </RequirePermission>
            )}
          </>
        }
        crumbs={[
          { label: pickLabel(group.label, i18n.language) },
          { label: pickLabel(leaf.label, i18n.language), to: "/documents/handovers" },
          { label: h.docNo },
        ]}
        title={t("DETAIL_TITLE")}
      />
      {error ? (
        <p className="rounded-md bg-danger/10 px-4 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <DetailHeaderCard
        fields={[
          { label: t("STYLE"), value: `#${h.styleNo}` },
          { label: t("STYLE_NAME"), value: h.styleName },
          { label: t("SEASON"), value: h.seasonCode },
          { label: t("CUSTOMER"), value: h.customerName },
          { label: t("OWNER"), value: h.ownerName },
          { label: t("COLLECTING_SINCE"), value: formatDate(h.collectingSince) },
          { label: t("COLLECTING_DAYS"), value: t("DAYS", { count: h.collectingDays }) },
          { label: t("PROGRESS"), value: `${h.okCount} / ${h.applicableCount}` },
          { label: t("FROZEN_AT"), value: h.frozenAt ? formatDate(h.frozenAt, true) : null },
          { label: t("COMPLETED_BY"), value: h.completedByName },
        ]}
        subtitle={`${h.docNo} ｜ ${h.customerName}`}
        tags={
          <>
            <ToneBadge label={h.customerName} tone="info" />
            <StatusBadge code={h.status} machine="handover" />
            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
              <Diamond aria-hidden="true" className="size-3.5" />
              {t("GATE_G1")}
            </span>
            {frozen ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Lock aria-hidden="true" className="size-3.5" />
                {t("FROZEN")}
              </span>
            ) : null}
          </>
        }
        title={`#${h.styleNo} · ${h.styleName}`}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <SectionCard
          extra={
            <span className={h.ready ? "text-success" : "text-danger"}>
              {h.ready ? t("READY") : t("MISSING_SUMMARY", { missing: h.missing.join("、") })}
            </span>
          }
          title={t("CHECKLIST_TITLE")}
        >
          <HandoverChecklist items={h.checklist} />
          <p className="mt-3 text-xs text-muted-foreground">{frozen ? t("FROZEN_NOTE") : t("LIVE_NOTE")}</p>
        </SectionCard>
        <SectionCard title={t("TECH_PACK")}>
          {h.techPackFile ? (
            <div className="flex items-center gap-3 rounded-md border border-border p-3">
              <FileText aria-hidden="true" className="size-5 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{h.techPackFile.filename}</p>
                <p className="text-xs text-muted-foreground">
                  {t("SIZE_KB", { size: Math.max(1, Math.round(h.techPackFile.size / 1024)) })}
                </p>
              </div>
              <Button
                aria-label={t("DOWNLOAD")}
                size="icon"
                variant="ghost"
                onClick={() => {
                  const file = h.techPackFile;
                  if (file) void run(() => downloadFile(file.id, file.filename, file.contentType));
                }}
              >
                <Download aria-hidden="true" className="size-4" />
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("NO_TECH_PACK")}</p>
          )}
          {!frozen && hasPermission("document.handover.edit") ? (
            <FileUpload
              className="mt-3"
              hint={t("TECH_PACK_HINT")}
              onUploaded={(file) =>
                void run(() => techPack.mutateAsync({ id: h.id, fileId: file.id, version: h.version }))
              }
            />
          ) : null}
        </SectionCard>
      </div>
      {h.snapshot ? (
        <SectionCard title={t("SNAPSHOT_TITLE")}>
          <FieldGrid
            items={[
              { label: t("SNAP_SAMPLE"), value: h.snapshot.sampleRef },
              { label: t("SNAP_QUOTE"), value: h.snapshot.quoteDocNo },
              { label: t("SNAP_REPORT"), value: h.snapshot.reportRef },
              {
                label: t("SNAP_CONDITIONS"),
                value: h.snapshot.conditions ? String(h.snapshot.conditions.length) : null,
              },
              { label: t("SNAP_CHECKED_AT"), value: formatDate(h.snapshot.checkedAt, true) },
            ]}
          />
        </SectionCard>
      ) : null}
      {h.changeLog.length ? (
        <SectionCard title={t("CHANGE_LOG")}>
          <ol className="space-y-2">
            {[...h.changeLog].reverse().map((entry) => (
              <li className="flex flex-wrap gap-x-3 text-sm" key={entry.at}>
                <span className="tabular text-muted-foreground">{formatDate(entry.at, true)}</span>
                <span className="font-medium">{entry.byName}</span>
                <span>{entry.reason}</span>
              </li>
            ))}
          </ol>
        </SectionCard>
      ) : null}
      <ConfirmDialog
        description={t("COMPLETE_CONFIRM", { styleNo: h.styleNo })}
        isProcessing={complete.isPending}
        open={confirming}
        title={t("COMPLETE")}
        onConfirm={() =>
          run(async () => {
            await complete.mutateAsync({ id: h.id, version: h.version });
            setConfirming(false);
          })
        }
        onOpenChange={setConfirming}
      />
      <HandoverChangeDialog handover={h} open={changing} onOpenChange={setChanging} />
    </section>
  );
}
