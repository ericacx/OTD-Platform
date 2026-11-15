import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ToneBadge } from "@/components/biz/status-badge";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDate } from "@/lib/date";

import { useRollbackFlowMutation } from "../flow.mutations";
import { useFlowVersionsQuery } from "../flow.queries";

import { errorText } from "./flow-labels";

import type { FlowVersionDto } from "../flow.types";

type VersionsSheetProps = {
  open: boolean;
  customerId: string;
  version: number;
  canRollback: boolean;
  onOpenChange: (open: boolean) => void;
};

const SUMMARY_KEYS = {
  modulesAdded: "SUMMARY_MODULES_ADDED",
  modulesRemoved: "SUMMARY_MODULES_REMOVED",
  itemsAdded: "SUMMARY_ITEMS_ADDED",
  itemsRemoved: "SUMMARY_ITEMS_REMOVED",
  paramsChanged: "SUMMARY_PARAMS_CHANGED",
  nodesAdded: "SUMMARY_NODES_ADDED",
  nodesRemoved: "SUMMARY_NODES_REMOVED",
} as const;

function summaryParts(v: FlowVersionDto): { key: keyof typeof SUMMARY_KEYS; values: string[] }[] {
  const s = v.summary;
  if (!s) return [];
  return (Object.keys(SUMMARY_KEYS) as (keyof typeof SUMMARY_KEYS)[])
    .map((key) => ({ key, values: Array.isArray(s[key]) ? (s[key] as unknown[]).map(String) : [] }))
    .filter((p) => p.values.length > 0);
}

export function VersionsSheet({ open, customerId, version, canRollback, onOpenChange }: VersionsSheetProps) {
  const { t } = useTranslation("flow");
  const { t: tc } = useTranslation();
  const versions = useFlowVersionsQuery(customerId, open);
  const rollback = useRollbackFlowMutation(customerId);
  const [target, setTarget] = useState<FlowVersionDto | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t("VERSIONS")}</SheetTitle>
          <SheetDescription>{t("VERSIONS_HINT")}</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          {versions.isLoading ? (
            <LoadingState />
          ) : versions.error ? (
            <ErrorState error={versions.error} />
          ) : (versions.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("VERSIONS_EMPTY")}</p>
          ) : (
            <ol className="space-y-2">
              {(versions.data ?? []).map((v) => (
                <li className="rounded-md border border-border p-3" key={v.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular font-semibold">v{v.versionNo}</span>
                    {v.isCurrent ? <ToneBadge label={t("CURRENT")} tone="success" /> : null}
                    <span className="text-xs text-muted-foreground">
                      {formatDate(v.publishedAt, true)} · {v.publishedByName ?? "—"}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {t("MODULE_COUNT", { count: v.moduleCount })} · {t("ITEM_COUNT", { count: v.itemCount })}
                    </span>
                  </div>
                  {v.note ? <p className="mt-1 text-sm">{v.note}</p> : null}
                  {summaryParts(v).length ? (
                    <p className="mt-1 break-words text-xs text-muted-foreground">
                      {summaryParts(v)
                        .map((p) => t(SUMMARY_KEYS[p.key], { values: p.values.join("、") }))
                        .join(" · ")}
                    </p>
                  ) : null}
                  {canRollback && !v.isCurrent ? (
                    target?.id === v.id ? (
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
                                await rollback.mutateAsync({ versionId: v.id, reason: reason.trim(), version });
                                setTarget(null);
                                setReason("");
                              } catch (err) {
                                setError(errorText(err, tc("BIZERR")));
                              }
                            })()
                          }
                        >
                          {t("ROLLBACK_CONFIRM")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setTarget(null)}>
                          {tc("ZCYE20")}
                        </Button>
                      </div>
                    ) : (
                      <Button className="mt-1 h-auto px-0" variant="link" onClick={() => setTarget(v)}>
                        {t("ROLLBACK_TO", { no: v.versionNo })}
                      </Button>
                    )
                  ) : null}
                </li>
              ))}
            </ol>
          )}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
