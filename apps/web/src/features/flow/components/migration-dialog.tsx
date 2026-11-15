import { useState } from "react";
import { useTranslation } from "react-i18next";

import { StatusBadge } from "@/components/biz/status-badge";
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
import { formatDate } from "@/lib/date";

import { useMigrateOrdersMutation } from "../flow.mutations";
import { useMigrationPreviewQuery } from "../flow.queries";

import { FlowDiffView } from "./flow-diff-view";
import { errorText } from "./flow-labels";

type MigrationDialogProps = { open: boolean; customerId: string; onOpenChange: (open: boolean) => void };

export function MigrationDialog({ open, customerId, onOpenChange }: MigrationDialogProps) {
  const { t } = useTranslation("flow");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[860px]">
        <DialogHeader>
          <DialogTitle>{t("MIGRATE_TITLE")}</DialogTitle>
          <DialogDescription>{t("MIGRATE_HINT")}</DialogDescription>
        </DialogHeader>
        {open ? <MigrationBody customerId={customerId} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function MigrationBody({ customerId, onDone }: { customerId: string; onDone: () => void }) {
  const { t } = useTranslation("flow");
  const { t: tc } = useTranslation();
  const preview = useMigrationPreviewQuery(customerId, true);
  const migrate = useMigrateOrdersMutation(customerId);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const data = preview.data;
  return (
    <div className="space-y-4">
      {preview.isLoading ? (
        <LoadingState />
      ) : preview.error ? (
        <ErrorState error={preview.error} />
      ) : data ? (
        <>
          <p className="text-sm">{t("MIGRATE_SUMMARY", { count: data.total, no: data.target.versionNo })}</p>
          {data.groups.map((g) => (
            <section className="space-y-2 rounded-md border border-border p-3" key={g.fromVersionId}>
              <h3 className="text-sm font-semibold">
                {t("MIGRATE_GROUP", { from: g.fromVersionNo ?? "?", to: data.target.versionNo, count: g.orderCount })}
              </h3>
              <FlowDiffView diff={g.diff} />
            </section>
          ))}
          {data.orders.length ? (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-muted-foreground">
                  <tr>
                    <th className="h-9 px-3 font-medium">{t("PO_NO")}</th>
                    <th className="px-3 font-medium">{t("ORDER_STATUS")}</th>
                    <th className="px-3 font-medium">{t("DUE_DATE")}</th>
                    <th className="px-3 font-medium">{t("FROM_VERSION")}</th>
                    <th className="px-3 font-medium">{t("OWNER")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((o) => (
                    <tr className="h-10 border-t border-border" key={o.id}>
                      <td className="tabular px-3 font-medium">{o.poNo}</td>
                      <td className="px-3">
                        <StatusBadge code={o.status} machine="order" />
                      </td>
                      <td className="tabular px-3">{formatDate(o.customerDueDate)}</td>
                      <td className="tabular px-3">v{o.fromVersionNo ?? "?"}</td>
                      <td className="px-3">{o.ownerName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("MIGRATE_NONE")}</p>
          )}
        </>
      ) : null}
      {done !== null ? (
        <Alert>
          <AlertDescription>{t("MIGRATE_DONE", { count: done })}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {tc("H1ICKD")}
        </Button>
        {data && data.total > 0 && done === null ? (
          <Button
            disabled={migrate.isPending}
            onClick={() =>
              void (async () => {
                setError(null);
                try {
                  const res = await migrate.mutateAsync({ targetVersionId: data.target.versionId });
                  setDone(res.migrated);
                } catch (err) {
                  setError(errorText(err, tc("BIZERR")));
                }
              })()
            }
          >
            {t("MIGRATE_CONFIRM", { count: data.total })}
          </Button>
        ) : null}
      </DialogFooter>
    </div>
  );
}
