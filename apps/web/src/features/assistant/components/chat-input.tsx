import { SendHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

import type { KeyboardEvent } from "react";

type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
};

export function ChatInput({ value, onChange, onSubmit, disabled }: ChatInputProps) {
  const { t } = useTranslation("assistant");

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!disabled && value.trim()) onSubmit();
  }

  return (
    <div className="border-t border-border px-4 py-3">
      <div className="flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-primary/50">
        <textarea
          aria-label={t("INPUT_LABEL")}
          className="max-h-40 min-h-[24px] flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("PLACEHOLDER")}
          rows={Math.min(6, Math.max(1, value.split("\n").length))}
          value={value}
        />
        <Button aria-label={t("SEND")} disabled={disabled || !value.trim()} onClick={onSubmit} size="sm" type="button">
          <SendHorizontal aria-hidden="true" className="size-4" />
        </Button>
      </div>
      <p className="mt-1.5 text-right text-[11px] text-subtle-foreground">{t("HINT")}</p>
    </div>
  );
}
