import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";
import { useLookups } from "@/features/masterdata/lookups.queries";

import { SYNC_KINDS, SYNC_PROTOCOLS, useSyncLabels } from "../sync.labels";
import { useSaveEndpointMutation } from "../sync.mutations";

import type { SyncEndpointDto } from "../sync.types";

type EndpointFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  endpoint: SyncEndpointDto | null;
};

function parseJson(text: string): Record<string, unknown> | null {
  if (!text.trim()) return {};
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function EndpointFormDialog({ open, onOpenChange, endpoint }: EndpointFormDialogProps) {
  const { t } = useTranslation("sync");
  const { t: tc } = useTranslation();
  const labels = useSyncLabels();
  const lookups = useLookups();
  const save = useSaveEndpointMutation();

  const schema = useMemo(
    () =>
      z
        .object({
          code: z
            .string()
            .trim()
            .regex(/^[A-Za-z0-9_-]{2,40}$/, tc("FRMINV")),
          name: z.string().trim().min(1, tc("FRMREQ")).max(80),
          kind: z.enum(SYNC_KINDS),
          customerId: z.string(),
          protocol: z.enum(SYNC_PROTOCOLS),
          baseUrl: z.string().trim().max(300),
          contact: z.string().trim().max(120),
          timeoutMs: z.string().regex(/^\d{4,6}$/, tc("FRMINV")),
          ownerId: z.string(),
          note: z.string().max(500),
          options: z.string().refine((v) => parseJson(v) !== null, t("JSON_INVALID")),
        })
        .superRefine((v, ctx) => {
          if (v.kind === "CUSTOMER" && !v.customerId)
            ctx.addIssue({ code: "custom", path: ["customerId"], message: tc("FRMREQ") });
          if ((v.protocol === "REST" || v.protocol === "SFTP") && !v.baseUrl)
            ctx.addIssue({ code: "custom", path: ["baseUrl"], message: tc("FRMREQ") });
        }),
    [t, tc],
  );

  const defaults = useMemo(
    () => ({
      code: endpoint?.code ?? "",
      name: endpoint?.name ?? "",
      kind: endpoint?.kind ?? ("CUSTOMER" as const),
      customerId: endpoint?.customerId ?? "",
      protocol: endpoint?.protocol ?? ("REST" as const),
      baseUrl: endpoint?.baseUrl ?? "",
      contact: endpoint?.contact ?? "",
      timeoutMs: String(endpoint?.timeoutMs ?? 30000),
      ownerId: endpoint?.ownerId ?? "",
      note: endpoint?.note ?? "",
      options: endpoint && Object.keys(endpoint.options).length ? JSON.stringify(endpoint.options, null, 2) : "",
    }),
    [endpoint],
  );

  return (
    <FormDialog
      defaultValues={defaults}
      open={open}
      schema={schema}
      title={endpoint ? t("ENDPOINT_EDIT") : t("ENDPOINT_NEW")}
      width="md"
      onOpenChange={onOpenChange}
      onSubmit={(values) => {
        const base = {
          name: values.name,
          kind: values.kind,
          customerId: values.customerId || null,
          protocol: values.protocol,
          baseUrl: values.baseUrl || null,
          contact: values.contact || null,
          timeoutMs: Number(values.timeoutMs),
          options: parseJson(values.options) ?? {},
          ownerId: values.ownerId || null,
          note: values.note || null,
        };
        return save.mutateAsync(
          endpoint
            ? { id: endpoint.id, input: { ...base, version: endpoint.version } }
            : { input: { ...base, code: values.code } },
        );
      }}
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldText
            disabled={Boolean(endpoint)}
            error={form.formState.errors.code?.message}
            label={t("CODE")}
            name="code"
            register={form.register}
          />
          <FormFieldText
            error={form.formState.errors.name?.message}
            label={t("NAME")}
            name="name"
            register={form.register}
          />
          <FormFieldSelect
            label={t("KIND")}
            name="kind"
            options={SYNC_KINDS.map((value) => ({ value, label: labels.kind(value) }))}
            register={form.register}
          />
          <FormFieldSelect
            error={form.formState.errors.customerId?.message}
            label={t("CUSTOMER")}
            name="customerId"
            options={[
              { value: "", label: "—" },
              ...(lookups.data?.customers ?? []).map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` })),
            ]}
            register={form.register}
          />
          <FormFieldSelect
            label={t("PROTOCOL")}
            name="protocol"
            options={SYNC_PROTOCOLS.map((value) => ({ value, label: labels.protocol(value) }))}
            register={form.register}
          />
          <FormFieldText
            error={form.formState.errors.timeoutMs?.message}
            label={t("TIMEOUT")}
            name="timeoutMs"
            register={form.register}
          />
          <FormFieldText
            className="sm:col-span-2"
            error={form.formState.errors.baseUrl?.message}
            label={t("ADDRESS")}
            name="baseUrl"
            placeholder="https://"
            register={form.register}
          />
          <FormFieldText label={t("CONTACT")} name="contact" register={form.register} />
          <FormFieldSelect
            label={t("OWNER")}
            name="ownerId"
            options={[
              { value: "", label: "—" },
              ...(lookups.data?.users ?? []).map((u) => ({ value: u.id, label: u.name })),
            ]}
            register={form.register}
          />
          <FormFieldTextarea className="sm:col-span-2" label={t("NOTE")} name="note" register={form.register} />
          <FormFieldTextarea
            className="font-mono text-xs sm:col-span-2"
            error={form.formState.errors.options?.message}
            label={t("MOCK_OPTIONS")}
            name="options"
            register={form.register}
            rows={4}
          />
        </div>
      )}
    </FormDialog>
  );
}
