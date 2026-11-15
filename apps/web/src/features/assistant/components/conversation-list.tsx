import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";

import type { ConversationDto } from "../assistant.types";

type ConversationListProps = {
  conversations: ConversationDto[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => Promise<void>;
};

export function ConversationList({ conversations, activeId, onSelect, onNew, onDelete }: ConversationListProps) {
  const { t } = useTranslation("assistant");
  const [pending, setPending] = useState<ConversationDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!pending) return;
    setDeleting(true);
    try {
      await onDelete(pending.id);
      setPending(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <Button className="w-full" onClick={onNew} type="button">
        <Plus aria-hidden="true" className="size-4" />
        {t("NEW_CHAT")}
      </Button>
      <p className="mt-4 mb-1 text-xs text-subtle-foreground">{t("RECENT")}</p>
      {conversations.length ? (
        <ul aria-label={t("RECENT")} className="space-y-1.5">
          {conversations.map((c) => (
            <li className="group relative" key={c.id}>
              <button
                aria-current={c.id === activeId ? "true" : undefined}
                className={cn(
                  "w-full rounded-lg border-l-[3px] border-transparent px-3 py-2.5 pr-8 text-left text-[13px] transition-colors hover:bg-muted",
                  c.id === activeId && "border-primary bg-primary-soft/60",
                )}
                onClick={() => onSelect(c.id)}
                type="button"
              >
                <span className="line-clamp-2">{c.title}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {formatDate(c.updatedAt, true)} · {t("MSG_COUNT", { count: c.messageCount })}
                </span>
              </button>
              <button
                aria-label={t("DELETE")}
                className="absolute top-2 right-1.5 rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger focus-visible:opacity-100"
                onClick={() => setPending(c)}
                type="button"
              >
                <Trash2 aria-hidden="true" className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{t("RECENT_EMPTY")}</p>
      )}
      <ConfirmDialog
        description={pending ? t("DELETE_CONFIRM", { title: pending.title }) : undefined}
        isProcessing={deleting}
        onConfirm={confirmDelete}
        onOpenChange={(open) => (open ? undefined : setPending(null))}
        open={pending !== null}
        title={t("DELETE_TITLE")}
        variant="destructive"
      />
    </div>
  );
}
