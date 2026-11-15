import { AUDIT_RESULTS, AUDIT_TYPES, FINDING_STATUSES } from "@otd/contracts/factoryaudit";
import { SEVERITIES, pickLabel, type Severity, type Tone } from "@otd/shared";
import { useTranslation } from "react-i18next";

import { ToneBadge } from "@/components/biz/status-badge";

import type { AuditResult, AuditType, FindingDto } from "../factoryaudit.types";

const RESULT_TONE: Record<AuditResult, Tone> = { PASS: "success", CONDITIONAL: "warning", FAIL: "danger" };

export function AuditTypeBadge({ type }: { type: AuditType }) {
  const { i18n } = useTranslation();
  return <ToneBadge label={pickLabel(AUDIT_TYPES[type], i18n.language)} tone="info" />;
}

export function AuditResultBadge({ result }: { result: AuditResult | null }) {
  const { i18n } = useTranslation();
  if (!result) return <span className="text-muted-foreground">—</span>;
  return <ToneBadge label={pickLabel(AUDIT_RESULTS[result], i18n.language)} tone={RESULT_TONE[result]} />;
}

export function SeverityBadge({ severity }: { severity: string }) {
  const { i18n } = useTranslation();
  const def = SEVERITIES[severity as Severity];
  if (!def) return <span className="text-muted-foreground">—</span>;
  return <ToneBadge label={pickLabel(def.label, i18n.language)} tone={def.tone} />;
}

export function FindingStatusBadge({ finding }: { finding: Pick<FindingDto, "status" | "overdue"> }) {
  const { i18n } = useTranslation();
  const tone: Tone = finding.status === "CLOSED" ? "success" : finding.overdue ? "danger" : "warning";
  return <ToneBadge label={pickLabel(FINDING_STATUSES[finding.status], i18n.language)} tone={tone} />;
}
