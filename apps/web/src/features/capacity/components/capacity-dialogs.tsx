import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldDate } from "@/components/form/form-field-date";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";

import {
  useAddRowMutation,
  useSetBacklogMutation,
  useTaskActionMutation,
  useUpdateRowMutation,
} from "../capacity.mutations";

import type { CapacityRowDto, LedgerTaskDto } from "../capacity.types";

export function KnitRowDialog({ row, onClose }: { row: CapacityRowDto | null; onClose: () => void }) {
  const { t } = useTranslation("capacity");
  const update = useUpdateRowMutation();
  const schema = useMemo(
    () =>
      z.object({
        leadDays: z.coerce.number().int().min(0, t("INT_RULE")).max(60, t("INT_RULE")),
        machineCount: z.coerce.number().int().min(0, t("INT_RULE")),
      }) as unknown as z.ZodType<{ leadDays: number; machineCount: number }>,
    [t],
  );
  if (!row) return null;
  return (
    <FormDialog
      defaultValues={{ leadDays: row.leadDays ?? 7, machineCount: row.machineCount ?? 0 }}
      description={t("ROW_EDIT_DESC", { base: row.baseName, needle: row.needleCode ?? "" })}
      open
      schema={schema}
      title={t("ROW_EDIT_TITLE")}
      onOpenChange={(open) => !open && onClose()}
      onSubmit={(values) => {
        const patch: { leadDays?: number; machineCount?: number } = {};
        if (values.leadDays !== row.leadDays) patch.leadDays = values.leadDays;
        if (values.machineCount !== row.machineCount) patch.machineCount = values.machineCount;
        return update.mutateAsync({ id: row.id, version: row.version, patch });
      }}
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldText
            error={form.formState.errors.leadDays?.message}
            label={t("LEAD_DAYS")}
            name="leadDays"
            register={form.register}
            type="number"
          />
          <FormFieldText
            error={form.formState.errors.machineCount?.message}
            label={t("MACHINES")}
            name="machineCount"
            register={form.register}
            type="number"
          />
        </div>
      )}
    </FormDialog>
  );
}

export function BacklogDialog({ row, onClose }: { row: CapacityRowDto | null; onClose: () => void }) {
  const { t } = useTranslation("capacity");
  const save = useSetBacklogMutation();
  const schema = useMemo(
    () =>
      z.object({ erpBacklog: z.coerce.number().min(0, t("INT_RULE")) }) as unknown as z.ZodType<{ erpBacklog: number }>,
    [t],
  );
  if (!row) return null;
  return (
    <FormDialog
      defaultValues={{ erpBacklog: row.erpBacklog ?? 0 }}
      description={t("BACKLOG_DESC", {
        base: row.baseName,
        needle: row.needleCode ?? "",
        otd: (row.otdUnproducedQty ?? 0).toLocaleString(),
      })}
      open
      schema={schema}
      title={t("BACKLOG_TITLE")}
      onOpenChange={(open) => !open && onClose()}
      onSubmit={(values) =>
        save.mutateAsync({
          versionId: row.versionId,
          rowId: row.id,
          version: row.version,
          erpBacklog: values.erpBacklog,
        })
      }
    >
      {(form) => (
        <FormFieldText
          error={form.formState.errors.erpBacklog?.message}
          label={t("ERP_BACKLOG")}
          name="erpBacklog"
          register={form.register}
          type="number"
        />
      )}
    </FormDialog>
  );
}

type ManualValues = {
  baseId: string;
  process: string;
  lines: string;
  monthOrders: string;
  scheduled: string;
  loadRate: string;
  dailyCapacity: string;
  bookedUntil: string;
  status: string;
};

const toNum = (v: string) => (v.trim() === "" ? null : Number(v));

type ManualProps = {
  ledger: "PACKING" | "SPECIAL";
  versionId: string;
  row: CapacityRowDto | null;
  bases: { id: string; name: string }[];
  open: boolean;
  onClose: () => void;
};

export function ManualRowDialog({ ledger, versionId, row, bases, open, onClose }: ManualProps) {
  const { t } = useTranslation("capacity");
  const add = useAddRowMutation();
  const update = useUpdateRowMutation();
  const schema = useMemo(
    () =>
      z.object({
        baseId: z.string().min(1, t("REQUIRED")),
        process: z.string().trim().max(60),
        lines: z.string(),
        monthOrders: z.string(),
        scheduled: z.string(),
        loadRate: z.string(),
        dailyCapacity: z.string(),
        bookedUntil: z.string(),
        status: z.string(),
      }),
    [t],
  );
  const s = (key: string) => {
    const v = row?.extra[key];
    return typeof v === "number" || typeof v === "string" ? String(v) : "";
  };
  if (!open) return null;
  return (
    <FormDialog<ManualValues>
      defaultValues={{
        baseId: row?.baseId ?? bases[0]?.id ?? "",
        process: row?.process ?? "",
        lines: s("lines"),
        monthOrders: s("monthOrders"),
        scheduled: s("scheduled"),
        loadRate: s("loadRate"),
        dailyCapacity: s("dailyCapacity"),
        bookedUntil: s("bookedUntil"),
        status: s("status") || "PENDING",
      }}
      open
      schema={schema}
      title={row ? t("ROW_EDIT_TITLE") : t("ROW_ADD")}
      onOpenChange={(v) => !v && onClose()}
      onSubmit={async (values) => {
        const extra =
          ledger === "PACKING"
            ? {
                lines: toNum(values.lines),
                monthOrders: toNum(values.monthOrders),
                scheduled: toNum(values.scheduled),
                loadRate: toNum(values.loadRate),
              }
            : {
                dailyCapacity: toNum(values.dailyCapacity),
                bookedUntil: values.bookedUntil || null,
                status: values.status,
              };
        if (row)
          return update.mutateAsync({
            id: row.id,
            version: row.version,
            patch: { extra, ...(ledger === "SPECIAL" ? { process: values.process || null } : {}) },
          });
        return add.mutateAsync({
          versionId,
          input: {
            ledger,
            baseId: values.baseId,
            process: ledger === "SPECIAL" ? values.process || null : null,
            extra,
          },
        });
      }}
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldSelect
            disabled={Boolean(row)}
            label={t("BASE")}
            name="baseId"
            options={bases.map((b) => ({ value: b.id, label: b.name }))}
            register={form.register}
          />
          {ledger === "PACKING" ? (
            <>
              <FormFieldText label={t("PK_LINES")} name="lines" register={form.register} type="number" />
              <FormFieldText label={t("PK_MONTH_ORDERS")} name="monthOrders" register={form.register} type="number" />
              <FormFieldText label={t("PK_SCHEDULED")} name="scheduled" register={form.register} type="number" />
              <FormFieldText label={t("PK_LOAD_RATE")} name="loadRate" register={form.register} type="number" />
            </>
          ) : (
            <>
              <FormFieldText label={t("SP_PROCESS")} name="process" register={form.register} />
              <FormFieldText label={t("SP_DAILY")} name="dailyCapacity" register={form.register} type="number" />
              <FormFieldDate label={t("SP_BOOKED_UNTIL")} name="bookedUntil" register={form.register} />
              <FormFieldSelect
                label={t("STATUS")}
                name="status"
                options={[
                  { value: "PENDING", label: t("SP_STATUS_PENDING") },
                  { value: "DONE", label: t("SP_STATUS_DONE") },
                ]}
                register={form.register}
              />
            </>
          )}
        </div>
      )}
    </FormDialog>
  );
}

export function TaskCompleteDialog({ task, onClose }: { task: LedgerTaskDto | null; onClose: () => void }) {
  const { t } = useTranslation("capacity");
  const action = useTaskActionMutation();
  const schema = useMemo(
    () => z.object({ currentVersion: z.string().trim().max(40), note: z.string().trim().max(300) }),
    [],
  );
  if (!task) return null;
  return (
    <FormDialog<{ currentVersion: string; note: string }>
      defaultValues={{ currentVersion: task.currentVersion ?? "", note: "" }}
      description={t("TASK_COMPLETE_DESC", { name: task.name })}
      open
      schema={schema}
      submitLabel={t("TASK_COMPLETE")}
      title={t("TASK_COMPLETE")}
      onOpenChange={(open) => !open && onClose()}
      onSubmit={(values) =>
        action.mutateAsync({
          id: task.id,
          kind: "complete",
          version: task.version,
          currentVersion: values.currentVersion || null,
          note: values.note || null,
        })
      }
    >
      {(form) => (
        <div className="grid gap-4">
          <FormFieldText label={t("TASK_VERSION")} name="currentVersion" register={form.register} />
          <FormFieldTextarea label={t("TASK_NOTE")} name="note" register={form.register} rows={2} />
        </div>
      )}
    </FormDialog>
  );
}
