import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

import type { PatrolHitDto } from "@otd/contracts/patrol";

type CloseHitDialogProps = {
  hit: PatrolHitDto | null;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (note: string) => void;
};

export function CloseHitDialog({ hit, pending, error, onCancel, onConfirm }: CloseHitDialogProps) {
  const { t } = useTranslation("patrol");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const missing = touched && !note.trim();
  return (
    <Dialog
      open={hit !== null}
      onOpenChange={(open) => {
        if (!open) {
          setNote("");
          setTouched(false);
          onCancel();
        }
      }}
    >
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t("CLOSE_TITLE")}</DialogTitle>
          <DialogDescription>{hit ? `${hit.ruleCode} · ${hit.targetNo ?? ""}` : ""}</DialogDescription>
        </DialogHeader>
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">{t("CLOSE_NOTE")}</span>
          <Textarea
            className="min-h-24"
            placeholder={t("CLOSE_NOTE_PLACEHOLDER")}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <p className="text-xs text-muted-foreground">{t("CLOSE_HINT")}</p>
        {missing || error ? (
          <Alert variant="destructive">
            <AlertDescription>{missing ? t("NOTE_REQUIRED") : error}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t("CANCEL")}
          </Button>
          <Button
            disabled={pending}
            onClick={() => {
              setTouched(true);
              if (note.trim()) {
                onConfirm(note.trim());
                setNote("");
                setTouched(false);
              }
            }}
          >
            {t("CONFIRM_CLOSE")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
