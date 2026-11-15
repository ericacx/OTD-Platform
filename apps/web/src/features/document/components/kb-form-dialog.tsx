import { Paperclip } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FileUpload } from "@/components/biz/file-upload";
import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";
import { useLookups } from "@/features/masterdata/lookups.queries";

import { useSaveKbDocumentMutation } from "../document.mutations";

import type { KbDocumentDto, KbKind } from "../document.types";

type Props = { kind: KbKind; open: boolean; onOpenChange: (open: boolean) => void; doc: KbDocumentDto | null };

export function KbFormDialog({ kind, open, onOpenChange, doc }: Props) {
  const { t } = useTranslation("document");
  const { t: tc } = useTranslation();
  const lookups = useLookups();
  const save = useSaveKbDocumentMutation();
  const schema = useMemo(
    () =>
      z.object({
        title: z.string().trim().min(1, tc("FRMREQ")).max(120),
        customerId: z.string(),
        tags: z.string().max(400),
        content: z.string().max(50_000),
        fileId: z.string(),
        fileName: z.string(),
      }),
    [tc],
  );
  const defaults = useMemo(
    () => ({
      title: doc?.title ?? "",
      customerId: doc?.customerId ?? "",
      tags: doc?.tags.join("，") ?? "",
      content: doc?.content ?? "",
      fileId: doc?.file?.id ?? "",
      fileName: doc?.file?.filename ?? "",
    }),
    [doc],
  );
  const prefix = kind === "MANUAL" ? "MANUAL" : "KB";
  return (
    <FormDialog
      defaultValues={defaults}
      open={open}
      schema={schema}
      title={doc ? t(`${prefix}_EDIT`) : t(`${prefix}_NEW`)}
      width="md"
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        save.mutateAsync({
          ...(doc ? { id: doc.id } : {}),
          input: {
            kind,
            title: values.title.trim(),
            customerId: values.customerId || null,
            tags: values.tags
              .split(/[,，、\s]+/)
              .map((tag) => tag.trim())
              .filter(Boolean),
            content: values.content,
            fileId: values.fileId || null,
            ...(doc ? { version: doc.version } : {}),
          },
        })
      }
    >
      {(form) => {
        const fileName = form.watch("fileName");
        return (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormFieldText
              error={form.formState.errors.title?.message}
              label={t("TITLE")}
              name="title"
              register={form.register}
            />
            <FormFieldSelect
              label={kind === "MANUAL" ? t("CUSTOMER") : t("CUSTOMER_OPTIONAL")}
              name="customerId"
              options={[
                { value: "", label: t("NO_CUSTOMER") },
                ...(lookups.data?.customers ?? []).map((c) => ({ value: c.id, label: c.name })),
              ]}
              register={form.register}
            />
            <div className="sm:col-span-2">
              <FormFieldText label={t("TAGS_INPUT")} name="tags" register={form.register} />
            </div>
            <div className="sm:col-span-2">
              <FormFieldTextarea label={t("CONTENT")} name="content" register={form.register} rows={10} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              {fileName ? (
                <p className="flex items-center gap-1.5 text-sm">
                  <Paperclip aria-hidden="true" className="size-4 text-muted-foreground" />
                  {fileName}
                </p>
              ) : null}
              <FileUpload
                hint={t("ATTACH_HINT")}
                onUploaded={(file) => {
                  form.setValue("fileId", file.id);
                  form.setValue("fileName", file.filename);
                }}
              />
            </div>
          </div>
        );
      }}
    </FormDialog>
  );
}
