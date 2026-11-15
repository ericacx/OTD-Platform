import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

type LoadingStateProps = {
  className?: string;
  label?: string;
};

export function LoadingState({ className, label }: LoadingStateProps) {
  const { t } = useTranslation();
  const message = label ?? t("HX3QAV");

  return (
    <div
      className={cn(
        "flex min-h-32 items-center justify-center gap-2 rounded-md border border-border bg-background p-6 text-sm text-muted-foreground",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
