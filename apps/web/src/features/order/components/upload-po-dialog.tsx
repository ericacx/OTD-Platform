import { pickLabel } from "@otd/shared";
import { FileCheck2, Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { FileUpload, type UploadedFile } from "@/components/biz/file-upload";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatNumber } from "@/lib/format";

import { useLookups } from "../../masterdata/lookups.queries";
import { useUploadPoMutation } from "../order.mutations";

import { RuleCheckList, ruleSummary } from "./rule-check-list";

import type { OrderDetail } from "../order.types";

const ACCEPT = ".pdf,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const FIELD_KEYS: Record<string, string> = {
  poNo: "F_PO",
  revision: "F_REVISION",
  customer: "F_CUSTOMER",
  seasonCode: "F_SEASON",
  tradeTerm: "F_TRADE_TERM",
  paymentTerms: "F_PAYMENT",
  currency: "F_CURRENCY",
  orderDate: "F_ORDER_DATE",
  dueDate: "F_DUE",
  transportMode: "F_TRANSPORT",
  destination: "F_DESTINATION",
  buyerEntity: "F_BUYER",
};

type UploadPoDialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

export function UploadPoDialog({ open, onOpenChange }: UploadPoDialogProps) {
  const { t } = useTranslation("order");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{t("UPLOAD_PO")}</DialogTitle>
          <DialogDescription>{t("UPLOAD_DESC")}</DialogDescription>
        </DialogHeader>
        {open ? <UploadPoBody onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function UploadPoBody({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation("order");
  const { t: tc } = useTranslation();
  const navigate = useNavigate();
  const selectId = useId();
  const lookups = useLookups();
  const upload = useUploadPoMutation();
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [result, setResult] = useState<OrderDetail | null>(null);

  if (result) {
    const summary = ruleSummary(result.ruleCheck);
    const lowConfidence = Object.entries(result.extraction ?? {})
      .filter(([key, field]) => FIELD_KEYS[key] && field.confidence < 0.6)
      .map(([key]) => t(FIELD_KEYS[key] as never));
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
          <p className="flex items-center gap-2 font-semibold">
            <FileCheck2 aria-hidden="true" className="size-4 text-success" />
            {t("UPLOAD_DONE", { po: result.poNo })}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("UPLOAD_SUMMARY", {
              customer: result.customerName,
              lines: result.lines.length + result.unmatchedLines.length,
              pairs: formatNumber(result.totalPairs, 0, i18n.language),
              due: result.customerDueDate,
            })}
          </p>
          {result.unmatchedLines.length ? (
            <p className="mt-1 text-sm text-warning">{t("UNMATCHED_TITLE", { count: result.unmatchedLines.length })}</p>
          ) : null}
          {lowConfidence.length ? (
            <p className="mt-1 text-sm text-warning">{t("LOW_CONFIDENCE", { fields: lowConfidence.join("、") })}</p>
          ) : null}
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">
            {t("RULE_TITLE")} ·{" "}
            <span className={summary.passed ? "text-success" : "text-danger"}>
              {summary.passed ? t("RULE_ALL_PASS") : t("RULE_FAILED", { count: summary.failed })}
            </span>
          </p>
          <RuleCheckList items={result.ruleCheck} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {tc("H1ICKD")}
          </Button>
          <Button
            type="button"
            onClick={() => {
              onClose();
              void navigate(`/orders/${result.id}`);
            }}
          >
            {t("BTN_VIEW_ORDER")}
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={selectId}>{t("UPLOAD_CUSTOMER")}</Label>
        <select
          className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
          id={selectId}
          value={customerId}
          onChange={(event) => setCustomerId(event.target.value)}
        >
          <option value="">{t("UPLOAD_CUSTOMER_AUTO")}</option>
          {(lookups.data?.customers ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {pickLabel({ zh: c.name, en: c.nameEn ?? c.name }, i18n.language)}
            </option>
          ))}
        </select>
      </div>
      <FileUpload accept={ACCEPT} hint={t("UPLOAD_FILE_HINT")} onUploaded={setFile} />
      {file ? <p className="text-sm text-muted-foreground">{t("UPLOAD_FILE_READY", { name: file.filename })}</p> : null}
      {upload.error ? (
        <Alert variant="destructive">
          <AlertDescription>{upload.error.message}</AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {tc("ZCYE20")}
        </Button>
        <Button
          disabled={!file || upload.isPending}
          type="button"
          onClick={() => {
            if (!file) return;
            upload.mutate({ fileId: file.id, customerId: customerId || undefined }, { onSuccess: setResult });
          }}
        >
          {upload.isPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
          {upload.isPending ? t("UPLOAD_RECOGNIZING") : t("UPLOAD_RECOGNIZE")}
        </Button>
      </DialogFooter>
    </div>
  );
}
