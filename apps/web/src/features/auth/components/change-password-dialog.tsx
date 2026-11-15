import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldText } from "@/components/form/form-field-text";

import { useChangePasswordMutation } from "../auth.mutations";

type ChangePasswordDialogProps = { open: boolean; onOpenChange: (open: boolean) => void; forced?: boolean };

export function ChangePasswordDialog({ open, onOpenChange, forced = false }: ChangePasswordDialogProps) {
  const { t } = useTranslation("auth");
  const mutation = useChangePasswordMutation();
  const schema = z
    .object({
      oldPassword: z.string().min(1, t("PWD_OLD_REQ")),
      newPassword: z
        .string()
        .min(10, t("PWD_RULE"))
        .regex(/[A-Za-z]/, t("PWD_RULE"))
        .regex(/\d/, t("PWD_RULE")),
      confirm: z.string(),
    })
    .refine((v) => v.newPassword === v.confirm, { message: t("PWD_MISMATCH"), path: ["confirm"] });

  return (
    <FormDialog
      defaultValues={{ oldPassword: "", newPassword: "", confirm: "" }}
      description={forced ? t("PWD_FORCED") : t("PWD_RULE")}
      open={open}
      schema={schema}
      submitLabel={t("PWD_SUBMIT")}
      title={t("PWD_TITLE")}
      onOpenChange={(next) => {
        if (!forced || !next) onOpenChange(next);
      }}
      onSubmit={(values) => mutation.mutateAsync({ oldPassword: values.oldPassword, newPassword: values.newPassword })}
    >
      {(form) => (
        <>
          <FormFieldText
            autoComplete="current-password"
            error={form.formState.errors.oldPassword?.message}
            label={t("PWD_OLD")}
            name="oldPassword"
            register={form.register}
            type="password"
          />
          <FormFieldText
            autoComplete="new-password"
            error={form.formState.errors.newPassword?.message}
            label={t("PWD_NEW")}
            name="newPassword"
            register={form.register}
            type="password"
          />
          <FormFieldText
            autoComplete="new-password"
            error={form.formState.errors.confirm?.message}
            label={t("PWD_CONFIRM")}
            name="confirm"
            register={form.register}
            type="password"
          />
        </>
      )}
    </FormDialog>
  );
}
