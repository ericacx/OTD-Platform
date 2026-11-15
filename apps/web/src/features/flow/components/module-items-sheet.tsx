import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ToneBadge } from "@/components/biz/status-badge";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { useDeleteItemMutation } from "../flow.mutations";
import { useServiceModuleQuery } from "../flow.queries";

import { errorText } from "./flow-labels";
import { ItemFormDialog } from "./item-form-dialog";

import type { ServiceItemDto } from "../flow.types";

type ModuleItemsSheetProps = { moduleId: string | null; canEdit: boolean; onClose: () => void };

export function ModuleItemsSheet({ moduleId, canEdit, onClose }: ModuleItemsSheetProps) {
  const { t } = useTranslation("flow");
  const { t: tc } = useTranslation();
  const detail = useServiceModuleQuery(moduleId);
  const remove = useDeleteItemMutation();
  const [editing, setEditing] = useState<ServiceItemDto | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<ServiceItemDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const mod = detail.data;

  return (
    <Sheet open={moduleId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{mod ? t("ITEMS_OF", { name: mod.name }) : t("ITEMS")}</SheetTitle>
          <SheetDescription>{mod ? `${mod.code} · ${mod.department}` : ""}</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          {canEdit && mod ? (
            <Button size="sm" onClick={() => setEditing(null)}>
              {t("ITEM_NEW")}
            </Button>
          ) : null}
          {detail.isLoading ? (
            <LoadingState />
          ) : detail.error ? (
            <ErrorState error={detail.error} />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {(mod?.items ?? []).map((item) => (
                <li className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5" key={item.id}>
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium">
                      <span className="tabular mr-2 text-xs text-muted-foreground">{item.code}</span>
                      {item.name}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(item.effects.nodes ?? []).map((n) => (
                        <ToneBadge key={n} label={n} tone="info" />
                      ))}
                      {(item.effects.gateConditions ?? []).map((g) => (
                        <ToneBadge key={g} label={g} tone="warning" />
                      ))}
                      {item.requiresCustomerConfirm ? <ToneBadge label={t("REQUIRES_CONFIRM")} tone="neutral" /> : null}
                    </div>
                  </div>
                  {canEdit ? (
                    <div className="flex shrink-0 gap-1">
                      <Button className="h-auto px-2 py-1" variant="link" onClick={() => setEditing(item)}>
                        {tc("1VV96U")}
                      </Button>
                      <Button
                        className="h-auto px-2 py-1 text-destructive"
                        variant="link"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleting(item);
                        }}
                      >
                        {tc("jAiN8T")}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        {moduleId ? (
          <ItemFormDialog
            item={editing ?? null}
            moduleId={moduleId}
            open={editing !== undefined}
            onOpenChange={(open) => !open && setEditing(undefined)}
          />
        ) : null}
        <ConfirmDialog
          description={deleteError ?? t("ITEM_DELETE_CONFIRM", { name: deleting?.name ?? "" })}
          isProcessing={remove.isPending}
          open={deleting !== null}
          title={tc("SXHEY7")}
          variant="destructive"
          onConfirm={async () => {
            if (!deleting) return;
            try {
              await remove.mutateAsync({ id: deleting.id, version: deleting.version });
              setDeleting(null);
            } catch (err) {
              setDeleteError(errorText(err, tc("BIZERR")));
            }
          }}
          onOpenChange={(open) => !open && setDeleting(null)}
        />
      </SheetContent>
    </Sheet>
  );
}
