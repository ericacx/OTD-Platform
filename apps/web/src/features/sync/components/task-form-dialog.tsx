import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";
import { useLookups } from "@/features/masterdata/lookups.queries";

import { SYNC_DIRECTIONS, SYNC_MODES, SYNC_OBJECTS, SYNC_TRIGGERS, useSyncLabels } from "../sync.labels";
import { useSaveTaskMutation } from "../sync.mutations";
import { useSyncEndpointsQuery, useSyncMappingsQuery } from "../sync.queries";

import type { SyncTaskDetailDto, SyncTaskDto } from "../sync.types";

type TaskFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: SyncTaskDto | null;
  onSaved?: (task: SyncTaskDetailDto) => void;
};

export function TaskFormDialog({ open, onOpenChange, task, onSaved }: TaskFormDialogProps) {
  const { t } = useTranslation("sync");
  const { t: tc } = useTranslation();
  const labels = useSyncLabels();
  const lookups = useLookups();
  const endpoints = useSyncEndpointsQuery({ pageSize: 200 });
  const mappings = useSyncMappingsQuery({ pageSize: 200 }, open);
  const save = useSaveTaskMutation();

  const schema = useMemo(
    () =>
      z
        .object({
          name: z.string().trim().min(1, tc("FRMREQ")).max(120),
          endpointId: z.string().min(1, tc("FRMREQ")),
          mappingId: z.string(),
          customerId: z.string(),
          object: z.enum(SYNC_OBJECTS),
          direction: z.enum(SYNC_DIRECTIONS),
          mode: z.enum(SYNC_MODES),
          trigger: z.enum(SYNC_TRIGGERS),
          intervalMinutes: z.string().regex(/^\d*$/, tc("FRMINV")),
          frequency: z.string().max(40),
          batchSize: z.string().regex(/^\d{1,4}$/, tc("FRMINV")),
          ownerId: z.string(),
          note: z.string().max(500),
        })
        .superRefine((v, ctx) => {
          if (v.trigger === "SCHEDULED" && !Number(v.intervalMinutes))
            ctx.addIssue({ code: "custom", path: ["intervalMinutes"], message: tc("FRMREQ") });
        }),
    [tc],
  );

  const defaults = useMemo(
    () => ({
      name: task?.name ?? "",
      endpointId: task?.endpointId ?? "",
      mappingId: task?.mappingId ?? "",
      customerId: task?.customerId ?? "",
      object: task?.object ?? ("ORDER_DUE" as const),
      direction: task?.direction ?? ("PUSH" as const),
      mode: task?.mode ?? ("INCREMENTAL" as const),
      trigger: task?.trigger ?? ("SCHEDULED" as const),
      intervalMinutes: task?.intervalMinutes ? String(task.intervalMinutes) : "720",
      frequency: task?.frequency ?? "",
      batchSize: String(task?.batchSize ?? 100),
      ownerId: task?.ownerId ?? "",
      note: task?.note ?? "",
    }),
    [task],
  );

  return (
    <FormDialog
      defaultValues={defaults}
      open={open}
      schema={schema}
      title={task ? t("TASK_EDIT") : t("TASK_NEW")}
      width="md"
      onOpenChange={onOpenChange}
      onSubmit={async (values) => {
        const scheduled = values.trigger === "SCHEDULED";
        const input = {
          name: values.name,
          endpointId: values.endpointId,
          mappingId: values.mappingId || null,
          customerId: values.customerId || null,
          object: values.object,
          direction: values.direction,
          mode: values.mode,
          trigger: values.trigger,
          intervalMinutes: scheduled ? Number(values.intervalMinutes) : null,
          frequency: scheduled ? values.frequency || null : null,
          batchSize: Number(values.batchSize) || 100,
          ownerId: values.ownerId || null,
          note: values.note || null,
        };
        const saved = await save.mutateAsync(
          task ? { id: task.id, input: { ...input, version: task.version } } : { input: { ...input, enabled: true } },
        );
        onSaved?.(saved);
      }}
    >
      {(form) => {
        const [endpointId, object, direction, trigger] = form.watch(["endpointId", "object", "direction", "trigger"]);
        const mappingOptions = (mappings.data?.items ?? []).filter(
          (m) => m.endpointId === endpointId && m.object === object && m.direction === direction,
        );
        return (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormFieldText
              className="sm:col-span-2"
              error={form.formState.errors.name?.message}
              label={t("TASK_NAME")}
              name="name"
              register={form.register}
            />
            <FormFieldSelect
              error={form.formState.errors.endpointId?.message}
              label={t("ENDPOINT")}
              name="endpointId"
              options={[
                { value: "", label: "—" },
                ...(endpoints.data?.items ?? []).map((e) => ({
                  value: e.id,
                  label: `${e.name}（${labels.kind(e.kind)}）`,
                })),
              ]}
              register={form.register}
            />
            <FormFieldSelect
              label={t("CUSTOMER")}
              name="customerId"
              options={[
                { value: "", label: "—" },
                ...(lookups.data?.customers ?? []).map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` })),
              ]}
              register={form.register}
            />
            <FormFieldSelect
              label={t("OBJECT")}
              name="object"
              options={SYNC_OBJECTS.map((value) => ({ value, label: labels.object(value) }))}
              register={form.register}
            />
            <FormFieldSelect
              label={t("DIRECTION")}
              name="direction"
              options={SYNC_DIRECTIONS.map((value) => ({ value, label: labels.direction(value) }))}
              register={form.register}
            />
            <FormFieldSelect
              className="sm:col-span-2"
              label={t("MAPPING")}
              name="mappingId"
              options={[
                { value: "", label: t("NO_MAPPING") },
                ...mappingOptions.map((m) => ({ value: m.id, label: m.name })),
              ]}
              register={form.register}
            />
            <FormFieldSelect
              label={t("MODE")}
              name="mode"
              options={SYNC_MODES.map((value) => ({ value, label: labels.mode(value) }))}
              register={form.register}
            />
            <FormFieldSelect
              label={t("TRIGGER")}
              name="trigger"
              options={SYNC_TRIGGERS.map((value) => ({ value, label: labels.trigger(value) }))}
              register={form.register}
            />
            {trigger === "SCHEDULED" ? (
              <>
                <FormFieldText
                  error={form.formState.errors.intervalMinutes?.message}
                  inputMode="numeric"
                  label={t("INTERVAL")}
                  name="intervalMinutes"
                  register={form.register}
                />
                <FormFieldText label={t("FREQUENCY")} name="frequency" register={form.register} />
              </>
            ) : null}
            <FormFieldText
              error={form.formState.errors.batchSize?.message}
              inputMode="numeric"
              label={t("BATCH_SIZE")}
              name="batchSize"
              register={form.register}
            />
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
          </div>
        );
      }}
    </FormDialog>
  );
}
