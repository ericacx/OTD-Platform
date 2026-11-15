import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
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

import { usePublishFlowMutation } from "../flow.mutations";
import { useFlowDiffQuery } from "../flow.queries";

import { FlowDiffView } from "./flow-diff-view";
import { errorText } from "./flow-labels";

type PublishDialogProps = {
  open: boolean;
  mode: "compare" | "publish";
  customerId: string;
  version: number;
  nextVersionNo: number;
  onOpenChange: (open: boolean) => void;
};

export function PublishDialog({ open, mode, customerId, version, nextVersionNo, onOpenChange }: PublishDialogProps) {
  const { t } = useTranslation("flow");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>
            {mode === "publish" ? t("PUBLISH_TITLE", { no: nextVersionNo }) : t("COMPARE_TITLE")}
          </DialogTitle>
          <DialogDescription>{mode === "publish" ? t("PUBLISH_HINT") : t("COMPARE_HINT")}</DialogDescription>
        </DialogHeader>
        {open ? (
          <PublishBody customerId={customerId} mode={mode} version={version} onDone={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PublishBody({
  customerId,
  mode,
  version,
  onDone,
}: {
  customerId: string;
  mode: "compare" | "publish";
  version: number;
  onDone: () => void;
}) {
  const { t } = useTranslation("flow");
  const { t: tc } = useTranslation();
  const diff = useFlowDiffQuery(customerId, true);
  const publish = usePublishFlowMutation(customerId);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      {diff.isLoading ? (
        <LoadingState />
      ) : diff.error ? (
        <ErrorState error={diff.error} />
      ) : diff.data ? (
        <FlowDiffView diff={diff.data} />
      ) : null}
      {mode === "publish" ? (
        <div className="space-y-1.5">
          <Label htmlFor="publish-note">{t("PUBLISH_NOTE")}</Label>
          <Input id="publish-note" maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {mode === "publish" ? tc("ZCYE20") : tc("H1ICKD")}
        </Button>
        {mode === "publish" ? (
          <Button
            disabled={publish.isPending || diff.data?.identical === true}
            onClick={() =>
              void (async () => {
                setError(null);
                try {
                  await publish.mutateAsync({ version, ...(note.trim() ? { note: note.trim() } : {}) });
                  onDone();
                } catch (err) {
                  setError(errorText(err, tc("BIZERR")));
                }
              })()
            }
          >
            {t("PUBLISH")}
          </Button>
        ) : null}
      </DialogFooter>
    </div>
  );
}
