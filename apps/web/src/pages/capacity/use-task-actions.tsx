import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useAuth } from "@/app/providers/auth-provider";
import { useTaskActionMutation } from "@/features/capacity/capacity.mutations";
import { TaskCompleteDialog } from "@/features/capacity/components/capacity-dialogs";

import type { LedgerTaskDto } from "@/features/capacity/capacity.types";

export function useTaskActions() {
  const { t } = useTranslation("capacity");
  const { user, hasPermission } = useAuth();
  const action = useTaskActionMutation();
  const [completing, setCompleting] = useState<LedgerTaskDto | null>(null);
  const canAct = (task: LedgerTaskDto) => hasPermission("capacity.task.edit") || (!!user && task.ownerId === user.id);
  const onStart = (task: LedgerTaskDto) =>
    action.mutate(
      { id: task.id, kind: "start", version: task.version },
      { onSuccess: () => toast.success(t("TASK_STARTED")), onError: (err) => toast.error(err.message) },
    );
  const dialog = <TaskCompleteDialog task={completing} onClose={() => setCompleting(null)} />;
  return { canAct, onStart, onComplete: setCompleting, dialog };
}
