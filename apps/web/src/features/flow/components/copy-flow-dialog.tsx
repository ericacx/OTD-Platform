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
import { Label } from "@/components/ui/label";

import { useCopyFlowMutation } from "../flow.mutations";

import { errorText } from "./flow-labels";

type Source = { customerId: string; code: string; name: string; moduleCount: number; itemCount: number };
type CopyFlowDialogProps = {
  open: boolean;
  customerId: string;
  version: number;
  sources: Source[];
  onOpenChange: (open: boolean) => void;
};

export function CopyFlowDialog({ open, customerId, version, sources, onOpenChange }: CopyFlowDialogProps) {
  const { t } = useTranslation("flow");
  const { t: tc } = useTranslation();
  const copy = useCopyFlowMutation(customerId);
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const options = sources.filter((s) => s.customerId !== customerId);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t("COPY_TITLE")}</DialogTitle>
          <DialogDescription>{t("COPY_HINT")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="copy-source">{t("COPY_SOURCE")}</Label>
          <select
            className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
            id="copy-source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
          >
            <option value="">—</option>
            {options.map((s) => (
              <option key={s.customerId} value={s.customerId}>
                {s.code} · {s.name}（{t("MODULE_COUNT", { count: s.moduleCount })} ·{" "}
                {t("ITEM_COUNT", { count: s.itemCount })}）
              </option>
            ))}
          </select>
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc("ZCYE20")}
          </Button>
          <Button
            disabled={!source || copy.isPending}
            onClick={() =>
              void (async () => {
                setError(null);
                try {
                  await copy.mutateAsync({ sourceCustomerId: source, version });
                  onOpenChange(false);
                } catch (err) {
                  setError(errorText(err, tc("BIZERR")));
                }
              })()
            }
          >
            {t("COPY_SUBMIT")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
