import { ROUND_TYPES } from "@otd/contracts/sample";
import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLookups } from "@/features/masterdata/lookups.queries";

import { useDictOptions } from "../dict";

export type ConfirmOptions = { factoryId: string | null; roundType: string; quantity: number };

type ConfirmPlanningDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (options: ConfirmOptions) => Promise<void>;
};

export function ConfirmPlanningDialog({ open, onOpenChange, onConfirm }: ConfirmPlanningDialogProps) {
  const { t } = useTranslation("planning");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t("CONFIRM_TITLE")}</DialogTitle>
          <DialogDescription>{t("CONFIRM_DESC")}</DialogDescription>
        </DialogHeader>
        {open ? <ConfirmBody onCancel={() => onOpenChange(false)} onConfirm={onConfirm} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ConfirmBody({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (o: ConfirmOptions) => Promise<void>;
}) {
  const { t } = useTranslation("planning");
  const { t: tc } = useTranslation();
  const lookups = useLookups();
  const roundTypes = useDictOptions("roundType", [...ROUND_TYPES]);
  const [factoryId, setFactoryId] = useState("");
  const [roundType, setRoundType] = useState("PROTO");
  const [quantity, setQuantity] = useState("6");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectClass = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm";

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm({ factoryId: factoryId || null, roundType, quantity: Math.max(1, Number(quantity) || 6) });
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("BIZERR"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="cf-factory">{t("CONFIRM_FACTORY")}</Label>
          <select
            className={selectClass}
            id="cf-factory"
            value={factoryId}
            onChange={(e) => setFactoryId(e.target.value)}
          >
            <option value="">{t("LATER_ASSIGN")}</option>
            {(lookups.data?.factories ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-round">{t("CONFIRM_ROUND")}</Label>
          <select
            className={selectClass}
            id="cf-round"
            value={roundType}
            onChange={(e) => setRoundType(e.target.value)}
          >
            {roundTypes.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-qty">{t("CONFIRM_QTY")}</Label>
          <Input id="cf-qty" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          {tc("ZCYE20")}
        </Button>
        <Button disabled={busy} onClick={() => void submit()}>
          {t("CONFIRM")}
        </Button>
      </DialogFooter>
    </div>
  );
}
