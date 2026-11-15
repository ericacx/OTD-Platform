import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { useUpdateMachineMutation } from "../capacity.mutations";
import { useBaseMachinesQuery } from "../capacity.queries";

import type { BaseMachineDto } from "../capacity.types";

function MachineRow({ machine }: { machine: BaseMachineDto }) {
  const { t } = useTranslation("capacity");
  const update = useUpdateMachineMutation();
  const [value, setValue] = useState(String(machine.machineCount));
  const dirty = value !== String(machine.machineCount);
  return (
    <tr className="border-t border-border [&>td]:px-3 [&>td]:py-2">
      <td>{machine.baseName}</td>
      <td className="font-medium">{machine.needleCode}</td>
      <td className="tabular text-right">{machine.dailyOutputPerMachine.toLocaleString()}</td>
      <td className="w-32">
        <Input
          aria-label={t("MACHINES_OF", { base: machine.baseName, needle: machine.needleCode })}
          className="h-8"
          min={0}
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </td>
      <td>
        <Button
          disabled={!dirty || update.isPending || !/^\d+$/.test(value)}
          size="sm"
          variant="outline"
          onClick={() =>
            update.mutate(
              {
                baseId: machine.baseId,
                needleTypeId: machine.needleTypeId,
                machineCount: Number(value),
                version: machine.version,
              },
              { onSuccess: () => toast.success(t("MACHINES_SAVED")), onError: (err) => toast.error(err.message) },
            )
          }
        >
          {t("SAVE")}
        </Button>
      </td>
    </tr>
  );
}

export function MachinesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation("capacity");
  const machines = useBaseMachinesQuery(open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{t("MACHINES_TITLE")}</DialogTitle>
          <DialogDescription>{t("MACHINES_DESC")}</DialogDescription>
        </DialogHeader>
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
              <th>{t("BASE")}</th>
              <th>{t("NEEDLE")}</th>
              <th className="text-right">{t("DAILY_OUTPUT")}</th>
              <th>{t("MACHINES")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(machines.data ?? []).map((m) => (
              <MachineRow key={`${m.id}-${m.version}`} machine={m} />
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}
