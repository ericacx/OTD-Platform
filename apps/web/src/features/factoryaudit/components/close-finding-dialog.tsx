import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";

import { useCloseFindingMutation } from "../factoryaudit.mutations";

import type { FindingDto } from "../factoryaudit.types";

type CloseFindingDialogProps = { finding: FindingDto | null; onClose: () => void };

export function CloseFindingDialog({ finding, onClose }: CloseFindingDialogProps) {
  const { t } = useTranslation("factoryaudit");
  const close = useCloseFindingMutation();
  const schema = useMemo(() => z.object({ closeNote: z.string().max(500) }), []);

  return (
    <FormDialog
      defaultValues={{ closeNote: "" }}
      {...(finding ? { description: finding.item } : {})}
      open={finding !== null}
      schema={schema}
      submitLabel={t("CLOSE_FINDING")}
      title={t("CLOSE_FINDING_TITLE")}
      onOpenChange={(open) => !open && onClose()}
      onSubmit={(values) => {
        if (!finding) return Promise.resolve();
        return close.mutateAsync({
          id: finding.id,
          version: finding.version,
          ...(values.closeNote ? { closeNote: values.closeNote } : {}),
        });
      }}
    >
      {(form) => <FormFieldTextarea label={t("CLOSE_NOTE")} name="closeNote" register={form.register} rows={3} />}
    </FormDialog>
  );
}
