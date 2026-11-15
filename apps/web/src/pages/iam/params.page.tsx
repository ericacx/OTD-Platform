import { useState } from "react";
import { useTranslation } from "react-i18next";

import { RequirePermission } from "@/app/router/guards";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateParamMutation } from "@/features/iam/iam.mutations";
import { useSystemParamsQuery } from "@/features/iam/iam.queries";
import { formatDate } from "@/lib/date";

import type { SystemParam } from "@/features/iam/iam.types";

export function ParamsPage() {
  const { t } = useTranslation("iam");
  const { t: tc } = useTranslation();
  const params = useSystemParamsQuery();
  const update = useUpdateParamMutation();
  const [editing, setEditing] = useState<SystemParam | null>(null);
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function open(param: SystemParam) {
    setEditing(param);
    setText(JSON.stringify(param.value, null, 2));
    setReason("");
    setError(null);
  }

  async function save() {
    if (!editing) return;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      setError(t("PARAM_JSON_INVALID"));
      return;
    }
    try {
      await update.mutateAsync({ key: editing.key, value, reason: reason || undefined });
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("BIZERR"));
    }
  }

  return (
    <section className="space-y-5">
      <PageHeader title={t("PARAMS_TITLE")} />
      {params.isLoading ? (
        <LoadingState />
      ) : params.error ? (
        <ErrorState error={params.error} />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-xs">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th className="h-11 px-4 font-medium">{t("PARAM_KEY")}</th>
                <th className="px-4 font-medium">{t("DESCRIPTION")}</th>
                <th className="px-4 font-medium">{t("PARAM_VALUE")}</th>
                <th className="px-4 font-medium">{t("UPDATED_AT")}</th>
                <th className="px-4 font-medium">{tc("TBL_ACTIONS")}</th>
              </tr>
            </thead>
            <tbody>
              {(params.data ?? []).map((p) => (
                <tr className="border-t border-border" key={p.key}>
                  <td className="px-4 py-3">
                    <code className="text-xs">{p.key}</code>
                  </td>
                  <td className="px-4">{p.description ?? "—"}</td>
                  <td className="max-w-80 truncate px-4 font-mono text-xs text-muted-foreground">
                    {JSON.stringify(p.value)}
                  </td>
                  <td className="tabular px-4 whitespace-nowrap">{formatDate(p.updatedAt, true)}</td>
                  <td className="px-4">
                    <RequirePermission code="iam.param.edit">
                      <Button className="h-auto px-0" variant="link" onClick={() => open(p)}>
                        {tc("1VV96U")}
                      </Button>
                    </RequirePermission>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{editing?.key}</DialogTitle>
          </DialogHeader>
          <Textarea
            aria-label={t("PARAM_VALUE")}
            className="min-h-40 font-mono text-xs"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <Input
            aria-label={t("GRANT_REASON")}
            placeholder={t("GRANT_REASON")}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              {tc("ZCYE20")}
            </Button>
            <Button disabled={update.isPending} onClick={() => void save()}>
              {tc("wodHc6")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
