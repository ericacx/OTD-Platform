import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { useStyleOptionsQuery } from "@/features/quote/quote.queries";

import { useCreateHandoverMutation } from "../document.mutations";

import type { HandoverDto } from "../document.types";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (handover: HandoverDto) => void };

export function HandoverCreateDialog({ open, onOpenChange, onCreated }: Props) {
  const { t } = useTranslation("document");
  const { t: tc } = useTranslation();
  const styles = useStyleOptionsQuery({}, open);
  const create = useCreateHandoverMutation();
  const schema = useMemo(() => z.object({ styleId: z.string().min(1, tc("FRMREQ")) }), [tc]);
  const options = [
    { value: "", label: t("STYLE_PICK") },
    ...(styles.data ?? [])
      .filter((s) => !s.handoverId)
      .map((s) => ({ value: s.id, label: `#${s.styleNo} · ${s.nameZh} · ${s.customerName}` })),
  ];
  return (
    <FormDialog
      defaultValues={{ styleId: "" }}
      description={t("CREATE_HINT")}
      open={open}
      schema={schema}
      title={t("HANDOVER_NEW")}
      onOpenChange={onOpenChange}
      onSubmit={async (values) => onCreated(await create.mutateAsync({ styleId: values.styleId }))}
    >
      {(form) => (
        <FormFieldSelect
          error={form.formState.errors.styleId?.message}
          label={t("STYLE")}
          name="styleId"
          options={options}
          register={form.register}
        />
      )}
    </FormDialog>
  );
}
