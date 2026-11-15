import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import type { FlowDetailDto } from "../flow.types";

type AddModuleDialogProps = {
  open: boolean;
  customerName: string;
  modules: FlowDetailDto["availableModules"];
  busy: boolean;
  onPick: (moduleCode: string) => void;
  onOpenChange: (open: boolean) => void;
};

export function AddModuleDialog({ open, customerName, modules, busy, onPick, onOpenChange }: AddModuleDialogProps) {
  const { t, i18n } = useTranslation("flow");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>
            {t("ADD_MODULE")} · {customerName}
          </DialogTitle>
          <DialogDescription>{t("ADD_MODULE_HINT")}</DialogDescription>
        </DialogHeader>
        {modules.length ? (
          <ul className="space-y-2">
            {modules.map((m) => (
              <li key={m.moduleCode}>
                <button
                  className="flex w-full items-center gap-3 rounded-md border border-border px-3 py-2.5 text-left text-sm hover:border-primary/40 hover:bg-primary-soft/40 disabled:opacity-50"
                  disabled={busy}
                  type="button"
                  onClick={() => onPick(m.moduleCode)}
                >
                  <Plus aria-hidden="true" className="size-4 text-primary" />
                  <span className="font-medium">{i18n.language.startsWith("en") && m.nameEn ? m.nameEn : m.name}</span>
                  <span className="text-muted-foreground">· {m.department}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {t("ITEM_COUNT", { count: m.itemCount })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("ADD_MODULE_NONE")}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
