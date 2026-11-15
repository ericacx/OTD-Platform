import { useTranslation } from "react-i18next";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { ReactNode } from "react";

interface ConfirmDialogProps {
  cancelLabel?: string;
  confirmLabel?: string;
  description?: ReactNode;
  isProcessing?: boolean;
  onCancel?: () => void;
  onConfirm: () => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
  variant?: "default" | "destructive";
}

export function ConfirmDialog({
  cancelLabel,
  confirmLabel,
  description,
  isProcessing = false,
  onCancel,
  onConfirm,
  onOpenChange,
  open,
  title,
  variant = "default",
}: ConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={isProcessing}
            onClick={() => {
              onCancel?.();
            }}
          >
            {cancelLabel ?? t("ZCYE20")}
          </AlertDialogCancel>
          <AlertDialogAction
            className={cn(variant === "destructive" && buttonVariants({ variant: "destructive" }))}
            disabled={isProcessing}
            onClick={(event) => {
              event.preventDefault();
              void onConfirm();
            }}
          >
            {confirmLabel ?? t("E21QxN")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
