import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type InitialPasswordDialogProps = { value: { name: string; password: string } | null; onClose: () => void };

export function InitialPasswordDialog({ value, onClose }: InitialPasswordDialogProps) {
  const { t } = useTranslation("iam");
  return (
    <Dialog open={value !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{t("INIT_PWD_TITLE")}</DialogTitle>
          <DialogDescription>{t("INIT_PWD_DESC", { name: value?.name ?? "" })}</DialogDescription>
        </DialogHeader>
        <p
          className="tabular rounded-md bg-muted px-4 py-3 text-center font-mono text-lg font-semibold tracking-wider"
          data-testid="initial-password"
        >
          {value?.password}
        </p>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (value) void navigator.clipboard?.writeText(value.password);
            }}
          >
            {t("COPY")}
          </Button>
          <Button type="button" onClick={onClose}>
            {t("INIT_PWD_DONE")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
