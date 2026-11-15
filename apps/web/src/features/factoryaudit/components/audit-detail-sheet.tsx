import { useState } from "react";
import { useTranslation } from "react-i18next";

import { FieldGrid } from "@/components/biz/field-grid";
import { StatusBadge } from "@/components/biz/status-badge";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDate } from "@/lib/date";

import { useCloseAuditMutation, useStartAuditMutation } from "../factoryaudit.mutations";
import { useAuditDetailQuery } from "../factoryaudit.queries";

import { AuditResultBadge, AuditTypeBadge, FindingStatusBadge, SeverityBadge } from "./audit-badges";
import { CloseFindingDialog } from "./close-finding-dialog";
import { FindingFormDialog, type FindingFormTarget } from "./finding-form-dialog";
import { RecordDialog } from "./record-dialog";

import type { FactoryAuditDto, FindingDto } from "../factoryaudit.types";

export type AuditPermissions = { recordEdit: boolean; findingEdit: boolean };

type AuditDetailSheetProps = { auditId: string | null; onClose: () => void; can: AuditPermissions };

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function AuditDetailSheet({ auditId, onClose, can }: AuditDetailSheetProps) {
  const { t } = useTranslation("factoryaudit");
  const { t: tc } = useTranslation();
  const detail = useAuditDetailQuery(auditId);
  const start = useStartAuditMutation();
  const close = useCloseAuditMutation();
  const [actionError, setActionError] = useState<string | null>(null);
  const [recording, setRecording] = useState<FactoryAuditDto | null>(null);
  const [findingTarget, setFindingTarget] = useState<FindingFormTarget | null>(null);
  const [closingFinding, setClosingFinding] = useState<FindingDto | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const audit = detail.data;
  const canAddFinding = audit?.status === "IN_PROGRESS" || audit?.status === "RECTIFYING";
  const canClose = audit?.status === "RECTIFYING" || (audit?.status === "IN_PROGRESS" && audit.result !== null);

  return (
    <Sheet
      open={auditId !== null}
      onOpenChange={(open) => {
        if (!open) {
          setActionError(null);
          onClose();
        }
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2">
            {t("DETAIL_TITLE")}
            {audit ? <span className="tabular">{audit.docNo}</span> : null}
            {audit ? <StatusBadge code={audit.status} machine="factoryAudit" /> : null}
          </SheetTitle>
          <SheetDescription>{audit ? `${audit.factoryName} · ${audit.customerName}` : ""}</SheetDescription>
        </SheetHeader>
        {detail.isLoading ? (
          <LoadingState />
        ) : detail.error ? (
          <ErrorState error={detail.error} />
        ) : audit ? (
          <div className="mt-5 space-y-5">
            <div className="flex flex-wrap gap-2">
              {audit.status === "PLANNED" && can.recordEdit ? (
                <Button
                  disabled={start.isPending}
                  onClick={() => {
                    setActionError(null);
                    start
                      .mutateAsync({ id: audit.id, version: audit.version })
                      .catch((err: unknown) => setActionError(errorText(err, tc("BIZERR"))));
                  }}
                >
                  {t("START")}
                </Button>
              ) : null}
              {audit.status === "IN_PROGRESS" && can.recordEdit ? (
                <Button onClick={() => setRecording(audit)}>{t("RECORD")}</Button>
              ) : null}
              {canClose && can.recordEdit ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setCloseError(null);
                    setConfirmClose(true);
                  }}
                >
                  {t("CLOSE_AUDIT")}
                </Button>
              ) : null}
              {canAddFinding && (can.recordEdit || can.findingEdit) ? (
                <Button variant="outline" onClick={() => setFindingTarget({ kind: "add", auditId: audit.id })}>
                  {t("ADD_FINDING")}
                </Button>
              ) : null}
            </div>
            {actionError ? (
              <Alert variant="destructive">
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            ) : null}
            <section className="rounded-[var(--radius)] border border-border bg-card p-4">
              <FieldGrid
                columns={2}
                items={[
                  { label: t("FACTORY"), value: `${audit.factoryCode} · ${audit.factoryName}` },
                  { label: t("BASE"), value: audit.baseName },
                  { label: t("AUDIT_TYPE"), value: <AuditTypeBadge type={audit.auditType} /> },
                  { label: t("CUSTOMER"), value: audit.customerName },
                  { label: t("PLANNED_DATE"), value: formatDate(audit.plannedDate) },
                  { label: t("ACTUAL_DATE"), value: formatDate(audit.actualDate) },
                  { label: t("AUDITOR"), value: audit.auditor },
                  { label: t("OWNER"), value: audit.ownerName },
                  { label: t("RESULT"), value: <AuditResultBadge result={audit.result} /> },
                  { label: t("SCORE"), value: audit.score === null ? null : String(audit.score) },
                  { label: t("CERT_UNTIL"), value: formatDate(audit.certificateValidUntil) },
                  {
                    label: t("FINDINGS"),
                    value: t("FINDINGS_SUMMARY", { open: audit.openFindingCount, overdue: audit.overdueFindingCount }),
                  },
                  { label: t("NOTE"), value: audit.note, span: "full" },
                ]}
              />
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">
                {t("FINDINGS")}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {t("FINDINGS_TOTAL", { count: audit.findings.length })}
                </span>
              </h3>
              {audit.findings.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  {t("NO_FINDINGS")}
                </p>
              ) : (
                <ul aria-label={t("FINDINGS")} className="space-y-2">
                  {audit.findings.map((f) => (
                    <li className="rounded-md border border-border bg-card p-3 text-sm" key={f.id}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <p className="font-medium">{f.item}</p>
                          <p className="text-xs text-muted-foreground">
                            {[f.responsible, f.correctiveAction].filter(Boolean).join(" · ") || "—"}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <SeverityBadge severity={f.severity} />
                          <FindingStatusBadge finding={f} />
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                          {t("DUE_DATE")} {formatDate(f.dueDate)}
                          {f.overdue ? (
                            <span className="ml-2 text-danger">{t("OVERDUE_DAYS", { days: f.overdueDays })}</span>
                          ) : null}
                          {f.closedAt ? (
                            <span className="ml-2">
                              {t("CLOSED_AT")} {formatDate(f.closedAt, true)}
                            </span>
                          ) : null}
                        </span>
                        {f.status === "OPEN" && can.findingEdit ? (
                          <span className="flex gap-1">
                            <Button
                              className="h-auto px-1 py-0"
                              variant="link"
                              onClick={() => setFindingTarget({ kind: "edit", finding: f })}
                            >
                              {tc("1VV96U")}
                            </Button>
                            <Button className="h-auto px-1 py-0" variant="link" onClick={() => setClosingFinding(f)}>
                              {t("CLOSE_FINDING")}
                            </Button>
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
        <RecordDialog audit={recording} onClose={() => setRecording(null)} />
        <FindingFormDialog target={findingTarget} onClose={() => setFindingTarget(null)} />
        <CloseFindingDialog finding={closingFinding} onClose={() => setClosingFinding(null)} />
        <ConfirmDialog
          description={closeError ?? t("CLOSE_AUDIT_CONFIRM", { docNo: audit?.docNo ?? "" })}
          isProcessing={close.isPending}
          open={confirmClose}
          title={t("CLOSE_AUDIT")}
          onConfirm={async () => {
            if (!audit) return;
            try {
              await close.mutateAsync({ id: audit.id, version: audit.version });
              setConfirmClose(false);
            } catch (err) {
              setCloseError(errorText(err, tc("BIZERR")));
            }
          }}
          onOpenChange={(open) => !open && setConfirmClose(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
