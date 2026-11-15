import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDate } from "@/lib/date";

import { useRollbackRulePackMutation } from "../flow.mutations";
import { useRulePackSnapshotsQuery } from "../flow.queries";

import { errorText } from "./flow-labels";

import type { RulePackDto, RulePackSnapshotDto } from "../flow.types";

type RulePackVersionsSheetProps = {
  pack: RulePackDto | null;
  canRollback: boolean;
  onOpenChange: (open: boolean) => void;
};

function SnapshotRow({
  pack,
  snap,
  canRollback,
}: {
  pack: RulePackDto;
  snap: RulePackSnapshotDto;
  canRollback: boolean;
}) {
  const { t } = useTranslation("flow");
  const { t: tc } = useTranslation();
  const rollback = useRollbackRulePackMutation(pack.id);
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <li className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tabular text-xs text-muted-foreground">v{snap.objectVersion}</span>
        <span className="text-xs text-muted-foreground">
          {formatDate(snap.createdAt, true)} · {snap.createdByName ?? "—"}
        </span>
        {snap.reason ? (
          <span className="ml-auto max-w-full truncate text-xs text-muted-foreground">{snap.reason}</span>
        ) : null}
      </div>
      {canRollback ? (
        editing ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input
              aria-label={t("ROLLBACK_REASON")}
              className="h-8 flex-1"
              placeholder={t("ROLLBACK_REASON")}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <Button
              disabled={!reason.trim() || rollback.isPending}
              size="sm"
              onClick={() =>
                void (async () => {
                  setError(null);
                  try {
                    await rollback.mutateAsync({ snapshotId: snap.id, reason: reason.trim() });
                    setEditing(false);
                    setReason("");
                  } catch (err) {
                    setError(errorText(err, tc("BIZERR")));
                  }
                })()
              }
            >
              {t("ROLLBACK_CONFIRM")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {tc("ZCYE20")}
            </Button>
          </div>
        ) : (
          <Button className="mt-1 h-auto px-0" variant="link" onClick={() => setEditing(true)}>
            {t("ROLLBACK_TO", { no: snap.objectVersion })}
          </Button>
        )
      ) : null}
      {error ? (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function RulePackVersionsSheet({ pack, canRollback, onOpenChange }: RulePackVersionsSheetProps) {
  const { t } = useTranslation("flow");
  const snapshots = useRulePackSnapshotsQuery(pack?.id ?? null);
  return (
    <Sheet open={pack !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t("PACK_VERSIONS", { name: pack?.name ?? "" })}</SheetTitle>
          <SheetDescription>{t("PACK_VERSIONS_HINT")}</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          {snapshots.isLoading ? (
            <LoadingState />
          ) : snapshots.error ? (
            <ErrorState error={snapshots.error} />
          ) : !(snapshots.data ?? []).length ? (
            <p className="text-sm text-muted-foreground">{t("PACK_VERSIONS_EMPTY")}</p>
          ) : (
            <ol className="space-y-2">
              {(snapshots.data ?? []).map((snap) => (
                <SnapshotRow canRollback={canRollback} key={snap.id} pack={pack!} snap={snap} />
              ))}
            </ol>
          )}
          {!canRollback ? (
            <Alert>
              <AlertDescription>{t("PACK_VERSIONS_READONLY")}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
