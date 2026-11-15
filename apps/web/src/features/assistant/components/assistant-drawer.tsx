import { useTranslation } from "react-i18next";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

import { AssistantChat } from "./assistant-chat";

import type { PageContext } from "../assistant.types";

export type AssistantDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context?: PageContext | undefined;
};

export function AssistantDrawer({ open, onOpenChange, context }: AssistantDrawerProps) {
  const { t } = useTranslation("assistant");
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        aria-describedby={undefined}
        className="flex w-full flex-col gap-0 p-0 sm:w-[420px] sm:max-w-[420px]"
        side="right"
      >
        <SheetTitle className="sr-only">{t("TITLE")}</SheetTitle>
        {open ? <AssistantChat context={context} onNavigate={() => onOpenChange(false)} variant="drawer" /> : null}
      </SheetContent>
    </Sheet>
  );
}
