import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useAssignModuleMutation } from "../flow.mutations";

import { errorText } from "./flow-labels";

import type { ServiceModuleDto } from "../flow.types";

type Customer = { id: string; code: string; name: string };
type AssignCustomersDialogProps = { module: ServiceModuleDto | null; customers: Customer[]; onClose: () => void };

export function AssignCustomersDialog({ module, customers, onClose }: AssignCustomersDialogProps) {
  return (
    <Dialog open={module !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        {module ? <AssignBody customers={customers} module={module} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function AssignBody({
  module,
  customers,
  onClose,
}: {
  module: ServiceModuleDto;
  customers: Customer[];
  onClose: () => void;
}) {
  const { t } = useTranslation("flow");
  const { t: tc } = useTranslation();
  const assign = useAssignModuleMutation();
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ assigned: string[]; skipped: string[] } | null>(null);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("ASSIGN_TITLE", { name: module.name })}</DialogTitle>
        <DialogDescription>{t("ASSIGN_HINT")}</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-2">
        {customers.map((c) => (
          <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm" key={c.id}>
            <Checkbox
              aria-label={c.name}
              checked={picked.includes(c.id)}
              onCheckedChange={(v) =>
                setPicked((prev) => (v === true ? [...prev, c.id] : prev.filter((x) => x !== c.id)))
              }
            />
            <span className="tabular text-xs text-muted-foreground">{c.code}</span>
            {c.name}
          </label>
        ))}
      </div>
      {result ? (
        <Alert>
          <AlertDescription>
            {t("ASSIGN_RESULT", {
              assigned: result.assigned.join("、") || "—",
              skipped: result.skipped.join("、") || "—",
            })}
          </AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {result ? tc("H1ICKD") : tc("ZCYE20")}
        </Button>
        {result ? null : (
          <Button
            disabled={!picked.length || assign.isPending}
            onClick={() =>
              void (async () => {
                setError(null);
                try {
                  setResult(await assign.mutateAsync({ moduleId: module.id, customerIds: picked }));
                } catch (err) {
                  setError(errorText(err, tc("BIZERR")));
                }
              })()
            }
          >
            {t("ASSIGN_SUBMIT")}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
