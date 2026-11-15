import { RefreshCw } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

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
import { Textarea } from "@/components/ui/textarea";

import { useConfirmOrderMutation, useRecheckOrderMutation } from "../order.mutations";

import { RuleCheckList, ruleSummary } from "./rule-check-list";

import type { OrderDetail } from "../order.types";

type ConfirmOrderDialogProps = {
  order: OrderDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canOverride: boolean;
};

export function ConfirmOrderDialog({ order, open, onOpenChange, canOverride }: ConfirmOrderDialogProps) {
  const { t } = useTranslation("order");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>{t("CONFIRM_TITLE", { po: order.poNo })}</DialogTitle>
          <DialogDescription>{t("CONFIRM_DESC")}</DialogDescription>
        </DialogHeader>
        {open ? <ConfirmBody canOverride={canOverride} order={order} onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ConfirmBody({
  order,
  canOverride,
  onClose,
}: {
  order: OrderDetail;
  canOverride: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation("order");
  const { t: tc } = useTranslation();
  const reasonId = useId();
  const confirm = useConfirmOrderMutation();
  const recheck = useRecheckOrderMutation();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const summary = ruleSummary(order.ruleCheck);
  const needsOverride = !summary.passed;
  const reasonMissing = needsOverride && reason.trim().length < 2;
  const blocked = needsOverride && !canOverride;
  const error = confirm.error ?? recheck.error;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">
          {t("RULE_TITLE")} ·{" "}
          <span className={summary.passed ? "text-success" : "text-danger"}>
            {summary.passed ? t("RULE_ALL_PASS") : t("RULE_FAILED", { count: summary.failed })}
          </span>
        </p>
        <Button
          disabled={recheck.isPending}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => recheck.mutate({ id: order.id })}
        >
          <RefreshCw aria-hidden="true" className="size-3.5" />
          {t("BTN_RECHECK")}
        </Button>
      </div>
      <RuleCheckList items={order.ruleCheck} />
      {needsOverride ? (
        blocked ? (
          <Alert variant="destructive">
            <AlertDescription>{t("NO_OVERRIDE_PERMISSION")}</AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor={reasonId}>{t("OVERRIDE_REASON")}</Label>
            <Textarea
              aria-invalid={touched && reasonMissing ? true : undefined}
              id={reasonId}
              rows={3}
              value={reason}
              onBlur={() => setTouched(true)}
              onChange={(event) => setReason(event.target.value)}
            />
            {touched && reasonMissing ? <p className="text-xs text-destructive">{t("OVERRIDE_REQUIRED")}</p> : null}
          </div>
        )
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {tc("ZCYE20")}
        </Button>
        <Button
          disabled={blocked || confirm.isPending}
          type="button"
          onClick={() => {
            setTouched(true);
            if (reasonMissing) return;
            confirm.mutate(
              { id: order.id, version: order.version, overrideReason: needsOverride ? reason.trim() : undefined },
              { onSuccess: onClose },
            );
          }}
        >
          {t("CONFIRM_SUBMIT")}
        </Button>
      </DialogFooter>
    </div>
  );
}
