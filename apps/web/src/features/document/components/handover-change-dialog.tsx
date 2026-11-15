import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";

import { useChangeHandoverMutation } from "../document.mutations";

import type { HandoverDto } from "../document.types";

type Props = { handover: HandoverDto; open: boolean; onOpenChange: (open: boolean) => void };

export function HandoverChangeDialog({ handover, open, onOpenChange }: Props) {
  const { t } = useTranslation("document");
  const change = useChangeHandoverMutation();
  const schema = useMemo(() => z.object({ reason: z.string().trim().min(2, t("REASON_RULE")).max(300) }), [t]);
  return (
    <FormDialog
      defaultValues={{ reason: "" }}
      description={t("CHANGE_HINT")}
      open={open}
      schema={schema}
      submitLabel={t("CHANGE_SUBMIT")}
      title={t("CHANGE_TITLE", { docNo: handover.docNo })}
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        change.mutateAsync({ id: handover.id, reason: values.reason.trim(), version: handover.version })
      }
    >
      {(form) => (
        <FormFieldTextarea
          error={form.formState.errors.reason?.message}
          label={t("CHANGE_REASON")}
          name="reason"
          register={form.register}
        />
      )}
    </FormDialog>
  );
}
