import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

import type { ReactNode } from "react";

type ErrorStateProps = {
  action?: ReactNode;
  className?: string;
  description?: string;
  error?: Error | null;
  title?: string;
};

export function ErrorState({ action, className, description, error, title }: ErrorStateProps) {
  const { t } = useTranslation();
  const heading = title ?? t("STERR");
  const message = description ?? error?.message;

  return (
    <Alert className={cn("border-destructive/40", className)} variant="destructive">
      <AlertTriangle className="size-4" aria-hidden="true" />
      <AlertTitle>{heading}</AlertTitle>
      {message ? <AlertDescription>{message}</AlertDescription> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </Alert>
  );
}
