import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "@/components/feedback/confirm-dialog";

import { useRemoveReferenceMutation } from "../reference-data.mutations";

import type { ReferenceEntity } from "../reference-data.keys";

export type DeleteTarget = { id: string; version?: number | undefined; name: string };

type DeleteConfirmDialogProps = {
  entity: ReferenceEntity;
  target: DeleteTarget | null;
  onClose: () => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
};

export function DeleteConfirmDialog({
  entity,
  target,
  onClose,
  title,
  description,
  confirmLabel,
}: DeleteConfirmDialogProps) {
  const { t } = useTranslation("masterdata");
  const { t: tc } = useTranslation();
  const remove = useRemoveReferenceMutation(entity);
  const [error, setError] = useState<string | null>(null);

  return (
    <ConfirmDialog
      description={error ?? description ?? t("DELETE_CONFIRM", { name: target?.name ?? "" })}
      isProcessing={remove.isPending}
      open={target !== null}
      title={title ?? tc("SXHEY7")}
      variant="destructive"
      {...(confirmLabel ? { confirmLabel } : {})}
      onConfirm={async () => {
        if (!target) return;
        setError(null);
        try {
          await remove.mutateAsync({ id: target.id, version: target.version });
          onClose();
        } catch (err) {
          setError(err instanceof Error ? err.message : tc("BIZERR"));
        }
      }}
      onOpenChange={(open) => {
        if (!open) {
          setError(null);
          onClose();
        }
      }}
    />
  );
}
