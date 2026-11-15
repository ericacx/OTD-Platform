import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

import type { LucideIcon } from "lucide-react";

export type CommandActionSection = "navigation" | "preferences" | "account";

export interface CommandAction {
  icon: LucideIcon;
  id: string;
  label: string;
  onSelect: () => void | Promise<void>;
  section: CommandActionSection;
}

interface CommandPaletteProps {
  actions: CommandAction[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

const SHORTCUT_LABEL = typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘K" : "Ctrl+K";
const SECTION_ORDER: CommandActionSection[] = ["navigation", "preferences", "account"];
const SECTION_KEY: Record<CommandActionSection, "CMDSNAV" | "CMDSPREF" | "CMDSACC"> = {
  navigation: "CMDSNAV",
  preferences: "CMDSPREF",
  account: "CMDSACC",
};

export function CommandPalette({ actions, onOpenChange, open }: CommandPaletteProps) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  const grouped = SECTION_ORDER.map((section) => ({
    section,
    items: actions.filter((action) => action.section === section),
  }));

  return (
    <>
      <Button
        className={cn("hidden gap-2 text-xs md:inline-flex")}
        onClick={() => onOpenChange(true)}
        size="sm"
        variant="outline"
      >
        <span>{t("CMDPHOLD")}</span>
        <kbd className="rounded border border-border bg-muted px-1.5 font-medium">{SHORTCUT_LABEL}</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={onOpenChange} title={t("CMDTITLE")}>
        <CommandInput placeholder={t("CMDPHOLD")} />
        <CommandList>
          <CommandEmpty>{t("CMDEMPTY")}</CommandEmpty>
          {grouped.map(({ items, section }, index) =>
            items.length === 0 ? null : (
              <div key={section}>
                {index > 0 ? <CommandSeparator /> : null}
                <CommandGroup heading={t(SECTION_KEY[section])}>
                  {items.map((action) => {
                    const Icon = action.icon;
                    return (
                      <CommandItem
                        key={action.id}
                        value={action.label}
                        onSelect={() => {
                          void action.onSelect();
                        }}
                      >
                        <Icon className="mr-2 size-4 text-muted-foreground" aria-hidden="true" />
                        <span>{action.label}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </div>
            ),
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
