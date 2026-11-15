import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";

import { useSaveReferenceMutation } from "../reference-data.mutations";

import type { BaseDetailDto, BaseMachineDto, NeedleTypeDto, baseMachineWriteSchema } from "@otd/contracts/masterdata";

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <p className="flex h-9 items-center rounded-md bg-muted px-3 text-sm text-muted-foreground">{value}</p>
    </div>
  );
}

type MachineFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machine: BaseMachineDto | null;
  bases: BaseDetailDto[];
  needleTypes: NeedleTypeDto[];
};

export function MachineFormDialog({ open, onOpenChange, machine, bases, needleTypes }: MachineFormDialogProps) {
  const { t } = useTranslation("masterdata");
  const save = useSaveReferenceMutation<BaseMachineDto, z.input<typeof baseMachineWriteSchema>>("baseMachines");
  const schema = useMemo(
    () =>
      z.object({
        baseId: z.string().min(1, t("FIELD_REQUIRED")),
        needleTypeId: z.string().min(1, t("FIELD_REQUIRED")),
        machineCount: z.coerce.number().int().min(0),
        dailyOutputPerMachine: z.coerce.number().min(0),
      }),
    [t],
  );
  const defaults = useMemo(
    () => ({
      baseId: machine?.baseId ?? bases[0]?.id ?? "",
      needleTypeId: machine?.needleTypeId ?? needleTypes[0]?.id ?? "",
      machineCount: machine?.machineCount ?? 0,
      dailyOutputPerMachine: machine?.dailyOutputPerMachine ?? 0,
    }),
    [machine, bases, needleTypes],
  );

  return (
    <FormDialog
      defaultValues={defaults}
      open={open}
      schema={schema}
      title={machine ? t("MACHINE_EDIT") : t("MACHINE_NEW")}
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        save.mutateAsync({
          id: machine?.id,
          input: {
            baseId: values.baseId,
            needleTypeId: values.needleTypeId,
            machineCount: values.machineCount,
            dailyOutputPerMachine: values.dailyOutputPerMachine,
            ...(machine ? { version: machine.version } : {}),
          },
        })
      }
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          {machine ? (
            <>
              <ReadonlyField label={t("MACHINE_BASE")} value={`${machine.baseCode} · ${machine.baseName}`} />
              <ReadonlyField label={t("MACHINE_NEEDLE")} value={machine.needleCode} />
            </>
          ) : (
            <>
              <FormFieldSelect
                error={form.formState.errors.baseId?.message}
                label={t("MACHINE_BASE")}
                name="baseId"
                options={bases.map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` }))}
                register={form.register}
              />
              <FormFieldSelect
                error={form.formState.errors.needleTypeId?.message}
                label={t("MACHINE_NEEDLE")}
                name="needleTypeId"
                options={needleTypes.map((n) => ({ value: n.id, label: n.code }))}
                register={form.register}
              />
            </>
          )}
          <FormFieldText
            error={form.formState.errors.machineCount?.message}
            label={t("MACHINE_COUNT")}
            name="machineCount"
            register={form.register}
            type="number"
          />
          <FormFieldText
            error={form.formState.errors.dailyOutputPerMachine?.message}
            label={t("MACHINE_DAILY")}
            name="dailyOutputPerMachine"
            register={form.register}
            step="0.1"
            type="number"
          />
        </div>
      )}
    </FormDialog>
  );
}
