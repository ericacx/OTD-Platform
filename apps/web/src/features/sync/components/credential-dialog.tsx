import { Plus, Trash2 } from "lucide-react";
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
import { formatDate } from "@/lib/date";

import { useUpdateCredentialMutation } from "../sync.mutations";

import type { SyncEndpointDto } from "../sync.types";

type Row = { key: string; value: string };

type CredentialDialogProps = { endpoint: SyncEndpointDto | null; onClose: () => void };

export function CredentialDialog({ endpoint, onClose }: CredentialDialogProps) {
  return (
    <Dialog open={endpoint !== null} onOpenChange={(open) => !open && onClose()}>
      {endpoint ? <CredentialBody endpoint={endpoint} key={endpoint.id} onClose={onClose} /> : null}
    </Dialog>
  );
}

function CredentialBody({ endpoint, onClose }: { endpoint: SyncEndpointDto; onClose: () => void }) {
  const { t } = useTranslation("sync");
  const { t: tc } = useTranslation();
  const update = useUpdateCredentialMutation();
  const masked = endpoint.credential.masked;
  const [rows, setRows] = useState<Row[]>(() =>
    Object.keys(masked).length ? Object.keys(masked).map((key) => ({ key, value: "" })) : [{ key: "token", value: "" }],
  );
  const [error, setError] = useState<string | null>(null);

  async function submit(credential: Record<string, string> | null) {
    setError(null);
    try {
      await update.mutateAsync({ id: endpoint.id, credential, version: endpoint.version });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("BIZERR"));
    }
  }

  const filled = rows.filter((r) => r.key.trim() && r.value);

  return (
    <DialogContent className="sm:max-w-[560px]">
      <DialogHeader>
        <DialogTitle>
          {t("CRED_TITLE")} · {endpoint.name}
        </DialogTitle>
        <DialogDescription>{t("CRED_HINT")}</DialogDescription>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">
        {endpoint.credential.configured
          ? `${t("CRED_CONFIGURED")} · ${t("CRED_UPDATED", { at: formatDate(endpoint.credential.updatedAt, true) })}`
          : t("CRED_NONE")}
      </p>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div className="grid grid-cols-[140px_1fr_auto] items-center gap-2" key={index}>
            <Input
              aria-label={t("CRED_KEY")}
              value={row.key}
              onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, key: e.target.value } : r)))}
            />
            <Input
              aria-label={`${t("CRED_VALUE")} ${row.key}`}
              autoComplete="off"
              placeholder={masked[row.key] ? `${t("CRED_CURRENT")} ${masked[row.key]}` : ""}
              type="password"
              value={row.value}
              onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)))}
            />
            <Button
              aria-label={t("REMOVE")}
              size="icon"
              type="button"
              variant="ghost"
              onClick={() => setRows(rows.filter((_, i) => i !== index))}
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </Button>
          </div>
        ))}
        <Button size="sm" type="button" variant="outline" onClick={() => setRows([...rows, { key: "", value: "" }])}>
          <Plus aria-hidden="true" className="size-4" />
          {t("CRED_ADD")}
        </Button>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter className="gap-2 sm:justify-between">
        <Button
          disabled={!endpoint.credential.configured || update.isPending}
          type="button"
          variant="ghost"
          onClick={() => void submit(null)}
        >
          {t("CRED_CLEAR")}
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {tc("ZCYE20")}
          </Button>
          <Button
            disabled={!filled.length || update.isPending}
            type="button"
            onClick={() => void submit(Object.fromEntries(filled.map((r) => [r.key.trim(), r.value])))}
          >
            {tc("wodHc6")}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}
